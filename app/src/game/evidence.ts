// Data and rules for the non-terminal challenges.
import { F, isIP, seeded } from './util'

export interface Packet { src: string; dst: string; proto: string; info: string; payload: string }

export function capture(secret: string): Packet[] {
  const r = seeded(7)
  const noise = (n: number) => Array.from({ length: n }, () => String.fromCharCode(Math.floor(r() * 256))).join('')
  const pc = '10.10.1.25', srv = '10.10.2.40'
  const P: [string, string, string, string, string][] = [
    [pc, '10.10.0.2', 'DNS', 'Standard query A files.riverbend.example', '\x12\x34\x01\x00\x00\x01files.riverbend.example'],
    ['10.10.0.2', pc, 'DNS', 'Standard query response A 10.10.2.40', '\x12\x34\x81\x80files.riverbend.example\x0a\x0a\x02\x28'],
    [pc, '142.250.72.4', 'TLSv1.3', 'Application Data', noise(48)],
    [pc, srv, 'TCP', '51544 → 21 [SYN]', ''],
    [srv, pc, 'TCP', '21 → 51544 [SYN, ACK]', ''],
    [pc, srv, 'TCP', '51544 → 21 [ACK]', ''],
    ['142.250.72.4', pc, 'TLSv1.3', 'Application Data', noise(64)],
    [srv, pc, 'FTP', 'Response', '220 Riverbend file server ready\r\n'],
    [pc, srv, 'FTP', 'Request', 'USER jlee\r\n'],
    [pc, '52.96.11.2', 'TLSv1.3', 'Application Data', noise(40)],
    [srv, pc, 'FTP', 'Response', '331 Please specify the password.\r\n'],
    [pc, srv, 'FTP', 'Request', `PASS ${F(secret)}\r\n`],
    ['52.96.11.2', pc, 'TLSv1.3', 'Application Data', noise(56)],
    [srv, pc, 'FTP', 'Response', '230 Login successful.\r\n'],
    [pc, srv, 'FTP', 'Request', 'PWD\r\n'],
    [srv, pc, 'FTP', 'Response', '257 "/home/jlee" is the current directory\r\n'],
    [pc, '10.10.255.255', 'ARP', 'Who has 10.10.1.1? Tell 10.10.1.25', ''],
    [pc, '142.250.72.4', 'TLSv1.3', 'Application Data', noise(32)],
  ]
  return P.map(([src, dst, proto, info, payload]) => ({ src, dst, proto, info, payload }))
}

export function authLog(): string[] {
  const L: string[] = []
  const r = seeded(11)
  let t = 0
  const ts = () => {
    t += 1 + Math.floor(r() * 40)
    const h = 1 + Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
    return `Nov 22 0${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const line = (msg: string) => L.push(`${ts()} files sshd[${2000 + L.length * 7}]: ${msg}`)
  line('Accepted publickey for itadmin from 10.10.5.20 port 50122 ssh2')
  const names = ['admin', 'root', 'test', 'user', 'oracle']
  for (let i = 0; i < 16; i++) line(`Failed password for ${i % 3 ? 'invalid user ' : ''}${names[i % 5]} from 203.0.113.17 port ${40000 + i * 13} ssh2`)
  line('Disconnected from authenticating user root 203.0.113.17 port 40211 [preauth]')
  for (let i = 0; i < 11; i++) line(`Failed password for ${['admin', 'root', 'teacher', 'jlee'][i % 4]} from 198.51.100.73 port ${52000 + i * 7} ssh2`)
  line('Accepted password for teacher from 198.51.100.73 port 52084 ssh2')
  line('pam_unix(sshd:session): session opened for user teacher by (uid=0)')
  line('Accepted publickey for itadmin from 10.10.5.20 port 50177 ssh2')
  for (let i = 0; i < 4; i++) line(`Failed password for root from 203.0.113.17 port ${41000 + i} ssh2`)
  return L
}

export const NMAP = `$ nmap -sV 10.10.1.50
Starting Nmap 7.95 ( https://nmap.org )
Nmap scan report for files.riverbend.example (10.10.1.50)
Host is up (0.0021s latency).
Not shown: 993 closed tcp ports (reset)
PORT     STATE SERVICE        VERSION
22/tcp   open  ssh            OpenSSH 9.6 (protocol 2.0)
23/tcp   open  telnet         Linux telnetd
80/tcp   open  http           nginx 1.24.0
443/tcp  open  ssl/http       nginx 1.24.0
445/tcp  open  microsoft-ds?
3389/tcp open  ms-wbt-server?
8080/tcp open  http-proxy

Nmap done: 1 IP address (1 host up) scanned in 6.42 seconds`

export const PHISH_HEADERS = `Delivered-To: jlee@riverbendsd.org
Return-Path: <bounce@riverbendsd-security.com>
Received: from mail.riverbendsd-security.com (mail.riverbendsd-security.com [203.0.113.99])
        by mx.riverbendsd.org with ESMTPS id 4f8a2c
        for <jlee@riverbendsd.org>; Mon, 23 Nov 2026 07:42:11 -0600
Received-SPF: fail (riverbendsd.org: domain of bounce@riverbendsd-security.com does not designate 203.0.113.99 as permitted sender)
Authentication-Results: mx.riverbendsd.org; spf=fail; dkim=none; dmarc=fail
From: "Riverbend IT Help Desk" <it-support@riverbendsd.org>
Reply-To: it-support@riverbendsd-security.com
Subject: Action required: your password expires today
Date: Mon, 23 Nov 2026 07:42:09 -0600`

export interface Rule { id: number; action: 'permit' | 'deny'; src: string; port: 'any' | '22' | '80' | '443' | '3389' }
export interface Flow { label: string; ip: string; port: number; allow: boolean }

export const FLOWS: Flow[] = [
  { label: 'Student 198.51.100.10 → website (HTTPS 443)', ip: '198.51.100.10', port: 443, allow: true },
  { label: 'Student 198.51.100.10 → website (HTTP 80)', ip: '198.51.100.10', port: 80, allow: true },
  { label: 'IT admin 10.10.5.20 → SSH 22', ip: '10.10.5.20', port: 22, allow: true },
  { label: 'Attacker 203.0.113.66 → SSH 22', ip: '203.0.113.66', port: 22, allow: false },
  { label: 'Internet host 192.0.2.50 → SSH 22', ip: '192.0.2.50', port: 22, allow: false },
  { label: 'Internet host 192.0.2.50 → RDP 3389', ip: '192.0.2.50', port: 3389, allow: false },
]

const ipn = (s: string) => s.split('.').reduce((a, b) => a * 256 + +b, 0)
export const srcValid = (s: string) => s === 'any' || isIP(s) || (/^\S+\/\d+$/.test(s) && isIP(s.split('/')[0]) && +s.split('/')[1] <= 32)
function matchSrc(s: string, ip: string) {
  if (s === 'any') return true
  if (isIP(s)) return s === ip
  const [n, b] = s.split('/')
  const div = 2 ** (32 - +b)
  return Math.floor(ipn(n) / div) === Math.floor(ipn(ip) / div)
}
/** Returns the index of the first matching rule, or -1 for the implicit deny. */
export function firstMatch(rules: Rule[], f: Flow) {
  return rules.findIndex(r => matchSrc(r.src, f.ip) && (r.port === 'any' || +r.port === f.port))
}

export interface SubnetQ { ip: string; net: string; bc: string; hosts: string; mask: string }
export function subnetQuestion(): SubnetQ {
  const pre = 24 + Math.floor(Math.random() * 7)
  const blk = 2 ** (32 - pre)
  const last = Math.floor(Math.random() * 256)
  const net = Math.floor(last / blk) * blk
  const r = () => Math.floor(Math.random() * 255)
  const base = [`192.168.${r()}`, `10.${r()}.${r()}`, `172.16.${r()}`][Math.floor(Math.random() * 3)]
  return { ip: `${base}.${last}/${pre}`, net: `${base}.${net}`, bc: `${base}.${net + blk - 1}`, hosts: String(blk - 2), mask: `255.255.255.${256 - blk}` }
}
