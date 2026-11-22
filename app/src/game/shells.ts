// Simulated command-line sessions: two Cisco IOS routers and a Linux workstation.
import { F, isIP, seeded } from './util'

export interface Shell {
  banner: string
  prompt(): string
  exec(cmd: string): string
}

type Mode = 'user' | 'priv' | 'config' | 'if' | 'line'
const PR: Record<Mode, string> = { user: '>', priv: '#', config: '(config)#', if: '(config-if)#', line: '(config-line)#' }
export const INV = "% Invalid input detected at '^' marker."
const SHOW_RUN = /^sh(ow?)? run(n(i(n(g(-config)?)?)?)?)?$/

function pingOut(ip: string, ok: boolean, first = false) {
  return (
    `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:\n` +
    (ok ? (first ? '.!!!!' : '!!!!!') : '.....') +
    `\nSuccess rate is ${ok ? (first ? '80 percent (4/5)' : '100 percent (5/5)') : '0 percent (0/5)'}` +
    (ok ? ', round-trip min/avg/max = 1/2/4 ms' : '')
  )
}

const HELP: Record<Mode, string> = {
  user: 'enable, show ip interface brief, ping <ip>',
  priv: 'configure terminal, show running-config, show ip interface brief, show interfaces, ping <ip>, disable',
  config: 'interface <name>, hostname, enable secret, username, ip domain-name, crypto key generate rsa, line vty 0 4, end, exit',
  if: 'ip address <ip> <mask>, no shutdown, shutdown, description <text>, exit, end',
  line: 'transport input ssh, login local, password <pw>, exit, end',
}

/** Shared IOS mode handling. Subclasses handle device-specific commands in `extra`. */
abstract class IOS implements Shell {
  mode: Mode = 'user'
  host: string
  abstract banner: string
  constructor(host: string) {
    this.host = host
  }
  prompt() {
    return this.host + PR[this.mode]
  }
  protected abstract extra(c: string, raw: string): string | undefined
  exec(cmd: string): string {
    const c = cmd.toLowerCase().replace(/\s+/g, ' ').trim()
    if (/^do /.test(c) && !['user', 'priv'].includes(this.mode)) {
      const m = this.mode
      this.mode = 'priv'
      const r = this.exec(cmd.replace(/^\s*do\s+/i, ''))
      this.mode = m
      return r
    }
    if (c === '?' || c === 'help') return `Common commands here: ${HELP[this.mode]}\nTip: inside config modes, put "do" in front of show or ping.`
    if ((c === 'end' || c === '^z') && !['user', 'priv'].includes(this.mode)) { this.mode = 'priv'; return '' }
    if (c === 'exit') {
      if (this.mode === 'if' || this.mode === 'line') this.mode = 'config'
      else if (this.mode === 'config') this.mode = 'priv'
      else if (this.mode === 'priv') this.mode = 'user'
      return ''
    }
    if (['en', 'ena', 'enab', 'enabl', 'enable'].includes(c) && this.mode === 'user') { this.mode = 'priv'; return '' }
    if (c === 'disable' && this.mode === 'priv') { this.mode = 'user'; return '' }
    if (/^conf(i(g(u(r(e)?)?)?)?)?( t(e(r(m(i(n(a(l)?)?)?)?)?)?)?)?$/.test(c)) {
      if (this.mode === 'priv') { this.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.' }
      if (this.mode === 'user') return INV + '\n(You need privileged mode first. Type enable.)'
    }
    if (/^hostname \S+$/.test(c) && this.mode === 'config') { this.host = cmd.trim().split(/\s+/)[1]; return '' }
    const r = this.extra(c, cmd.trim())
    return r === undefined ? INV : r
  }
}

interface Iface { ip: string | null; mask: string | null; up: boolean; desc: string }
const MASK_OK = /^255\.255\.255\.(0|128|192|224|240|248|252|255)$|^255\.255\.(0|128|192|224|240|248|252|254|255)\.0$|^255\.0\.0\.0$/

export class RouterRescue extends IOS {
  banner = 'R2 console. Type ? for help.'
  cur = ''
  pinged = false
  ifs: Record<string, Iface> = {
    'GigabitEthernet0/0': { ip: null, mask: null, up: false, desc: 'WAN to ISP' },
    'GigabitEthernet0/1': { ip: '10.20.1.1', mask: '255.255.255.0', up: true, desc: 'LAN' },
  }
  private secret: string
  constructor(secret: string) {
    super('R2')
    this.secret = secret
  }
  private get wan() { return this.ifs['GigabitEthernet0/0'] }
  private wanOK() { return this.wan.up && this.wan.ip === '203.0.113.2' && this.wan.mask === '255.255.255.252' }
  private brief() {
    return 'Interface              IP-Address      OK? Method Status                Protocol\n' +
      Object.entries(this.ifs).map(([n, i]) => n.padEnd(23) + (i.ip || 'unassigned').padEnd(16) + 'YES ' + (i.ip ? 'manual' : 'unset ').padEnd(7) + (i.up ? 'up' : 'administratively down').padEnd(22) + (i.up ? 'up' : 'down')).join('\n')
  }
  private run() {
    return `Building configuration...\n!\nhostname ${this.host}\n!\n` +
      Object.entries(this.ifs).map(([n, i]) => `interface ${n}\n description ${i.desc}\n` + (i.ip ? ` ip address ${i.ip} ${i.mask}\n` : ' no ip address\n') + (i.up ? '' : ' shutdown\n') + '!').join('\n') +
      '\nip route 0.0.0.0 0.0.0.0 203.0.113.1\n!\nend'
  }
  protected extra(c: string, raw: string) {
    let m: RegExpMatchArray | null
    if ((m = c.match(/^int(?:e(?:r(?:f(?:a(?:c(?:e)?)?)?)?)?)? ?(?:g|gi|gig|gigabitethernet) ?0\/([01])$/)) && ['config', 'if'].includes(this.mode)) {
      this.cur = 'GigabitEthernet0/' + m[1]; this.mode = 'if'; return ''
    }
    if (this.mode === 'if') {
      const I = this.ifs[this.cur]
      if (/^ip add(ress)? \S+\/\d+$/.test(c)) return INV + '\n(IOS needs a dotted subnet mask like 255.255.255.0, not a /prefix.)'
      if ((m = c.match(/^ip add(?:ress)? (\S+) (\S+)$/))) {
        if (!isIP(m[1]) || !isIP(m[2])) return INV
        if (!MASK_OK.test(m[2])) return `% Bad mask ${m[2]} for address ${m[1]}`
        I.ip = m[1]; I.mask = m[2]; return ''
      }
      if (/^no ip add(ress)?$/.test(c)) { I.ip = null; I.mask = null; return '' }
      if (/^no shut(d(o(w(n)?)?)?)?$/.test(c)) {
        if (I.up) return ''
        I.up = true
        return `%LINK-3-UPDOWN: Interface ${this.cur}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${this.cur}, changed state to up`
      }
      if (/^shut(d(o(w(n)?)?)?)?$/.test(c)) {
        if (!I.up) return ''
        I.up = false
        return `%LINK-5-CHANGED: Interface ${this.cur}, changed state to administratively down`
      }
      if (/^desc(ription)? /.test(c)) { I.desc = raw.replace(/^\S+\s+/, ''); return '' }
      return undefined
    }
    if (this.mode === 'user' || this.mode === 'priv') {
      if (/^sh(ow?)? ip int(e(r(f(a(c(e)?)?)?)?)?)? br(i(e(f)?)?)?$/.test(c)) return this.brief()
      if (SHOW_RUN.test(c)) return this.mode === 'priv' ? this.run() : INV + '\n(show running-config needs privileged mode. Type enable.)'
      if (/^sh(ow?)? int(erfaces?)?( .*)?$/.test(c))
        return Object.entries(this.ifs).map(([n, i]) => `${n} is ${i.up ? 'up' : 'administratively down'}, line protocol is ${i.up ? 'up' : 'down'}\n  Description: ${i.desc}\n  Internet address is ${i.ip ? i.ip + ' ' + i.mask : 'not set'}`).join('\n')
      if (/^sh(ow?)? ip route$/.test(c))
        return 'Gateway of last resort is 203.0.113.1 to network 0.0.0.0\n\nS*    0.0.0.0/0 [1/0] via 203.0.113.1\nC     10.20.1.0/24 is directly connected, GigabitEthernet0/1' + (this.wanOK() ? '\nC     203.0.113.0/30 is directly connected, GigabitEthernet0/0' : '')
      if ((m = c.match(/^ping (\S+)$/))) {
        const ip = m[1]
        if (!isIP(ip)) return '% Unrecognized host or address, or protocol not running.'
        if (/^10\.20\.1\./.test(ip)) return pingOut(ip, true)
        if (!this.wanOK()) return pingOut(ip, false)
        const first = !this.pinged
        this.pinged = true
        return pingOut(ip, true, first) + `\n\n%ISP-GW: Uplink verified. Outage ticket closed. Code: ${F(this.secret)}`
      }
    }
    return undefined
  }
}

export interface AuditCheck { ok: boolean; label: string; fix: string }

export class LockItDown extends IOS {
  banner = 'R3 console. Type ? for help.'
  secretSet = false
  pass: string | null = 'cisco'
  users: Record<string, 'secret' | 'password'> = {}
  domain: string | null = null
  rsa = 0
  vty = { transport: 'all', login: 'line', pass: 'cisco' as string | null }
  constructor() {
    super('R3')
  }
  private run() {
    const L = ['Building configuration...', '!', `hostname ${this.host}`, '!']
    if (this.secretSet) L.push('enable secret 9 $9$mK2p8sQx1Zr0aT$wA7cYv3nU')
    if (this.pass) L.push(`enable password ${this.pass}`)
    Object.entries(this.users).forEach(([u, t]) => L.push(`username ${u} ${t === 'secret' ? 'secret 9 $9$Lq0rZ4nB2xYt1E$kP8' : 'password 0 ' + u}`))
    if (this.domain) L.push(`ip domain name ${this.domain}`)
    if (this.rsa) L.push('ip ssh version 2')
    L.push('!', 'interface GigabitEthernet0/0', ' ip address 10.30.1.1 255.255.255.0', '!', 'line vty 0 4')
    if (this.vty.pass) L.push(` password ${this.vty.pass}`)
    L.push(this.vty.login === 'local' ? ' login local' : this.vty.login === 'line' ? ' login' : ' no login')
    L.push(` transport input ${this.vty.transport}`, '!', 'end')
    return L.join('\n')
  }
  protected extra(c: string, raw: string) {
    let m: RegExpMatchArray | null
    const words = raw.split(/\s+/)
    if (this.mode === 'config') {
      if (/^enable secret (\d )?\S+$/.test(c)) { this.secretSet = true; return '' }
      if (/^enable password \S+$/.test(c)) { this.pass = words[2]; return '' }
      if (c === 'no enable password') { this.pass = null; return '' }
      if ((m = c.match(/^username (\S+)(?: privilege \d+)? (secret|password)(?: \d)? \S+$/))) { this.users[words[1]] = m[2] as 'secret' | 'password'; return '' }
      if ((m = c.match(/^ip domain[- ]name (\S+)$/))) { this.domain = m[1]; return '' }
      if (/^crypto key gen(e(r(a(t(e)?)?)?)?)? rsa/.test(c)) {
        if (!this.domain) return '% Please define a domain-name first.'
        const mm = c.match(/modulus (\d+)/)
        const bits = mm ? +mm[1] : 2048
        this.rsa = bits
        return `The name for the keys will be: ${this.host}.${this.domain}\n% The key modulus size is ${bits} bits\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK]\n%SSH-5-ENABLED: SSH 2.0 has been enabled`
      }
      if (/^ip ssh ver(sion)? 2$/.test(c) || c === 'service password-encryption') return ''
      if (/^line vty 0 (4|15)$/.test(c)) { this.mode = 'line'; return '' }
      return undefined
    }
    if (this.mode === 'line') {
      if ((m = c.match(/^transport input (.+)$/))) {
        const v = m[1].split(' ').sort().join(' ')
        if (!['ssh', 'telnet', 'all', 'none', 'ssh telnet'].includes(v)) return INV
        this.vty.transport = v === 'ssh telnet' ? 'telnet ssh' : v
        return ''
      }
      if (c === 'login local') { this.vty.login = 'local'; return '' }
      if (c === 'login') { this.vty.login = 'line'; return '' }
      if (c === 'no login') { this.vty.login = 'none'; return '' }
      if (/^password \S+$/.test(c)) { this.vty.pass = words[1]; return '' }
      if (c === 'no password') { this.vty.pass = null; return '' }
      if (/^exec-timeout/.test(c)) return ''
      return undefined
    }
    if (SHOW_RUN.test(c)) return this.mode === 'priv' ? this.run() : INV + '\n(show running-config needs privileged mode. Type enable.)'
    if (/^sh(ow?)? ip ssh$/.test(c)) return this.rsa ? 'SSH Enabled - version 2.0' : 'SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH.'
    return undefined
  }
  audit(): AuditCheck[] {
    const hasSecretUser = Object.values(this.users).includes('secret')
    return [
      { ok: this.secretSet, label: 'Enable secret is set', fix: this.pass ? 'Only a weak enable password is set. Use enable secret.' : 'Set enable secret.' },
      { ok: hasSecretUser, label: 'A local admin account uses a secret', fix: Object.keys(this.users).length ? 'Use username NAME secret PASSWORD, not password.' : 'Create one: username admin secret YourPass1' },
      { ok: !!this.domain && this.rsa >= 2048, label: 'SSH is ready (domain name and 2048-bit RSA keys)', fix: !this.domain ? 'Set ip domain-name first.' : this.rsa && this.rsa < 2048 ? `Keys are only ${this.rsa} bits. Regenerate with modulus 2048.` : 'Generate RSA keys.' },
      { ok: this.vty.transport === 'ssh', label: 'Remote logins allow SSH only', fix: `VTY lines allow: ${this.vty.transport}.` },
      { ok: this.vty.login === 'local' && hasSecretUser, label: 'Remote logins use local accounts', fix: 'VTY lines need login local and a local account.' },
    ]
  }
}

interface Dir { d?: string[]; f?: Record<string, string> }

export class LinuxShell implements Shell {
  banner = 'Ubuntu 24.04 LTS. Type help for commands.'
  cwd = '/home/student'
  private fs: Record<string, Dir>
  constructor(secret: string) {
    const svc = ['systemd[1]: Started Daily apt download activity.', 'CRON[2211]: (root) CMD (run-parts /etc/cron.hourly)', 'NetworkManager[640]: <info> dhcp4 (wlan0): state changed bound', 'kernel: [UFW BLOCK] IN=wlan0 SRC=10.10.1.77 DST=10.10.1.25 PROTO=UDP DPT=5353', 'systemd[1]: Starting Cleanup of Temporary Directories...', 'cupsd[901]: printer Room-114-HP is idle', 'sshd[1550]: Server listening on 0.0.0.0 port 22.', 'NetworkManager[640]: <info> device (wlan0): Activation successful']
    const r = seeded(3)
    const lines: string[] = []
    for (let i = 0; i < 200; i++) {
      const t = `Nov 22 ${String(8 + Math.floor(i / 40)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')} riverbend-pc `
      lines.push(t + (i === 137 ? `wifi-setup[812]: saved admin config ssid=Riverbend-Staff admin_pass=${F(secret)}` : svc[Math.floor(r() * svc.length)]))
    }
    this.fs = {
      '/': { d: ['home', 'var', 'etc'] },
      '/home': { d: ['student'] },
      '/home/student': {
        d: ['Documents', 'Downloads'],
        f: {
          'notes.txt': 'Printer in room 114 is jammed again.\nRemember to update the lab computers Friday.',
          '.todo': 'TODO\n- order toner for room 114\n- the setup script saved the Wi-Fi admin password into the system log in /var/log\n  (that log is huge, search it instead of reading it)',
          '.bash_history': 'ls\ncd Documents\nnano schedule.txt\nsudo ./wifi-setup.sh\nexit',
        },
      },
      '/home/student/Documents': { f: { 'schedule.txt': 'Mon: lab 3 imaging\nTue: Chromebook repairs\nWed: network closet cleanup', 'report.docx': '(binary file)' } },
      '/home/student/Downloads': { f: {} },
      '/var': { d: ['log'] },
      '/var/log': { f: { syslog: lines.join('\n'), 'auth.log': 'Nov 22 07:58:12 riverbend-pc sshd[1602]: Accepted publickey for student from 10.10.5.20 port 50122' } },
      '/etc': { f: { hostname: 'riverbend-pc', 'os-release': 'NAME="Ubuntu"\nVERSION="24.04 LTS"' } },
    }
  }
  prompt() {
    return `student@riverbend-pc:${this.cwd.replace('/home/student', '~')}$ `
  }
  private resolve(p?: string) {
    if (!p || p === '~') return '/home/student'
    let base = p.startsWith('/') ? [] : this.cwd.split('/').filter(Boolean)
    if (p.startsWith('~/')) { base = ['home', 'student']; p = p.slice(2) }
    for (const seg of p.split('/').filter(Boolean)) {
      if (seg === '.') continue
      if (seg === '..') base.pop()
      else base.push(seg)
    }
    return '/' + base.join('/')
  }
  private fileAt(p: string): string | null {
    const parent = p.slice(0, p.lastIndexOf('/')) || '/'
    const name = p.slice(p.lastIndexOf('/') + 1)
    const d = this.fs[parent]
    return d?.f && Object.prototype.hasOwnProperty.call(d.f, name) ? d.f[name] : null
  }
  exec(raw: string): string {
    const a = raw.split(/\s+/)
    const cmd = a[0]
    switch (cmd) {
      case 'help': return 'Commands: ls [-a] [folder], cd <folder>, pwd, cat <file>, grep <word> <file>, whoami, clear'
      case 'pwd': return this.cwd
      case 'whoami': return 'student'
      case 'clear': return '\f'
      case 'ls': {
        const flags = a.filter(x => x.startsWith('-')).join('')
        const target = a.slice(1).find(x => !x.startsWith('-'))
        const p = this.resolve(target || '.')
        const d = this.fs[p]
        if (!d) return this.fileAt(p) !== null ? p.slice(p.lastIndexOf('/') + 1) : `ls: cannot access '${target}': No such file or directory`
        let items = [...(d.d || []).map(x => x + '/'), ...Object.keys(d.f || {})]
        items = flags.includes('a') ? ['./', '../', ...items] : items.filter(x => !x.startsWith('.'))
        return items.sort().join('  ') || '(empty)'
      }
      case 'cd': {
        const p = this.resolve(a[1])
        if (this.fs[p]) { this.cwd = p; return '' }
        return `cd: ${a[1]}: No such file or directory`
      }
      case 'cat': {
        if (!a[1]) return 'cat: missing file name'
        const p = this.resolve(a[1])
        if (this.fs[p]) return `cat: ${a[1]}: Is a directory`
        const t = this.fileAt(p)
        if (t === null) return `cat: ${a[1]}: No such file or directory`
        const L = t.split('\n')
        return L.length > 30 ? L.slice(-12).join('\n') + `\n\n(${L.length} lines. Showing the last 12. Too long to read? Search it with grep.)` : t
      }
      case 'grep': {
        const args = a.slice(1).filter(x => !x.startsWith('-'))
        if (args.length < 2) return 'usage: grep <word> <file>'
        const pat = args[0].replace(/^['"]|['"]$/g, '').toLowerCase()
        const t = this.fileAt(this.resolve(args[1]))
        if (t === null) return `grep: ${args[1]}: No such file or directory`
        return t.split('\n').filter(l => l.toLowerCase().includes(pat)).slice(0, 20).join('\n')
      }
      case 'sudo': case 'rm': case 'nano': case 'vim': case 'vi':
        return `${cmd}: not available in this challenge`
      default:
        return `${cmd}: command not found. Type help for commands.`
    }
  }
}
