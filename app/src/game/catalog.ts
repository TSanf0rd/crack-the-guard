import type { Category, Challenge, ToolChallenge } from './types'
import { AI_TARGETS } from './aiTargets'
import { rnd } from './util'

export const CATS: Category[] = [
  { id: 'aiw', code: 'AI', name: 'AI Warm-up', sub: 'Trick chatbots' },
  { id: 'aia', code: 'AI-ADV', name: 'AI Advanced', sub: 'AI meets IT' },
  { id: 'cisco', code: 'CSC', name: 'Cisco', sub: 'CCST' },
  { id: 'net', code: 'NET', name: 'Network Security', sub: 'Network+' },
  { id: 'ite', code: 'ITE', name: 'IT Essentials', sub: 'A+' },
  { id: 'quick', code: 'QF', name: 'Quick-fire', sub: 'Speed round' },
]

const TOOLS: ToolChallenge[] = [
  {
    id: 'cisco1', code: 'CSC-01', cat: 'cisco', pts: 200, kind: 'router', name: 'Router rescue', gen: () => 'UPLINK-' + rnd(4),
    desc: 'Riverbend School District’s branch router R2 lost its internet connection after a technician’s change. The ISP’s handoff sheet says: your WAN address is 203.0.113.2/30 on GigabitEthernet0/0, and the ISP gateway is 203.0.113.1.',
    mission: 'Bring the WAN link back up and ping the ISP gateway.',
    tech: { name: 'Cisco IOS interface configuration', what: 'Cisco routers have modes: user (>), privileged (#), global config, and interface config. Check the interface status, give the WAN interface its IP address and subnet mask, turn it on, then test with ping.', ex: 'Type enable, then show ip interface brief to see what’s wrong.' },
    cert: 'Cisco CCST Networking: configuring and troubleshooting interfaces',
    hints: ['Gi0/0 is missing its IP address and is administratively down.', 'Get to the interface: enable, configure terminal, interface g0/0.', 'IOS wants a subnet mask, not /30. A /30 is 255.255.255.252. Then no shutdown, end, and ping 203.0.113.1.'],
    rep: { t: 'Cisco IOS interface configuration', w: 'Misconfigured or shut-down interfaces cause real outages. Network techs fix them with the same commands you just used: show ip interface brief, interface configuration, and ping to verify.', d: 'Use change management, document interface settings, and monitor links so an outage gets caught in minutes instead of hours.' },
  },
  {
    id: 'cisco2', code: 'CSC-02', cat: 'cisco', pts: 300, kind: 'lockdown', name: 'Lock it down', gen: () => 'HARDENED-' + rnd(4),
    desc: 'Router R3 failed a security audit. Anyone on the network can log in remotely with Telnet using the password cisco, and the enable password is stored the weak way.',
    mission: 'Harden R3 until the security audit passes all five checks.',
    tech: { name: 'Cisco device hardening', what: 'Secure device management means a strong enable secret, a local admin account, SSH instead of Telnet, and making the VTY lines (remote logins) use those local accounts.', ex: 'Run the security audit to see what fails, then fix one check at a time.' },
    cert: 'Cisco CCST Networking and CompTIA Network+: securing device management',
    hints: ['enable secret, username, and ip domain-name all go in global config mode (configure terminal).', 'SSH needs RSA keys: crypto key generate rsa modulus 2048, after setting a domain name.', 'Remote logins are the VTY lines: line vty 0 4, then transport input ssh and login local.'],
    rep: { t: 'Cisco device hardening', w: 'Telnet sends usernames and passwords in plain text, so anyone capturing network traffic can read them. Hardening guides for network devices call for SSH, strong enable secrets, and individual accounts instead of one shared password.', d: 'Use SSH only, enable secret instead of enable password, individual local or centralized (AAA) accounts, and limit which networks can reach management interfaces.' },
  },
  {
    id: 'net1', code: 'NET-01', cat: 'net', pts: 100, kind: 'nmap', name: 'Nmap scan', answer: '23', alt: ['23/tcp'],
    desc: 'You scanned a school file server with Nmap, the most popular port scanner. Seven ports are open.',
    mission: 'Find the port running a remote-login service that sends passwords in plain text. Submit flag{PORT}.',
    tech: { name: 'Reading an Nmap scan', what: 'Nmap lists each open port and the service running on it. Knowing which services are old and unencrypted is exactly what the ports and protocols objectives on Network+ cover.', ex: 'Look at the SERVICE column for a remote-login service older than SSH.' },
    cert: 'CompTIA Network+ and Security+: ports, protocols, and scanning',
    hints: ['SSH on port 22 is the encrypted way to log in remotely. What did people use before SSH?', 'It’s Telnet. Which port is it on?'],
    rep: { t: 'Port scanning', w: 'Attackers scan for open ports before almost every attack, and exposed remote-access services like Telnet and RDP (port 3389) have long been common ways in.', d: 'Close services you don’t need, replace Telnet with SSH, and keep remote access like RDP behind a VPN instead of open to the internet.' },
  },
  {
    id: 'net2', code: 'NET-02', cat: 'net', pts: 200, kind: 'pcap', name: 'Packet sniffer', gen: () => 'FTP-' + rnd(4),
    desc: 'A teacher logged into the school’s file server while you captured the network traffic. Most of it is encrypted, but not all of it.',
    mission: 'Find the password that crossed the network in plain text.',
    tech: { name: 'Packet analysis', what: 'Tools like Wireshark show every packet on a network. Encrypted protocols like HTTPS look like random bytes, but older protocols like FTP and Telnet send everything, including passwords, as readable text.', ex: 'Type ftp in the display filter, then open each packet and read its bytes.' },
    cert: 'CompTIA Network+: protocols and packet analysis',
    hints: ['HTTPS (TLS) traffic is encrypted. Look for an older protocol.', 'Filter for ftp. A login happens in a few packets: USER, then PASS.', 'Open the FTP request right after “331 Please specify the password.”'],
    rep: { t: 'Packet analysis', w: 'Anyone who can capture traffic on a network, like on public Wi-Fi or through a compromised switch, can read FTP and Telnet logins. That’s why these protocols have been replaced by SFTP and SSH.', d: 'Use encrypted protocols like SFTP, SSH, and HTTPS, and segment networks so fewer devices can see each other’s traffic.' },
  },
  {
    id: 'net3', code: 'NET-03', cat: 'net', pts: 300, kind: 'firewall', name: 'Firewall rules', gen: () => 'ACL-' + rnd(4),
    desc: 'Riverbend’s web server 10.10.1.80 hosts the school website on ports 80 and 443. IT admins manage it over SSH (port 22) from the admin network 10.10.5.0/24. Right now the firewall allows everything, and an attacker at 203.0.113.66 is brute-forcing SSH.',
    mission: 'Keep the website up, let admins in, block everything else.',
    tech: { name: 'Firewall ACLs', what: 'Firewalls check rules from top to bottom and use the first one that matches. Traffic that matches no rule is blocked, which is called the implicit deny. Good rules allow only what’s needed.', ex: 'Replace “permit any any” with rules that permit only web traffic and SSH from the admin network.' },
    cert: 'CompTIA Network+: ACLs and firewall rules',
    hints: ['The first rule, permit any any, matches everything. Change it or delete it.', 'You need three permit rules: any to port 80, any to port 443, and 10.10.5.0/24 to port 22.', 'You don’t need deny rules. The implicit deny blocks everything else, including the attacker and RDP.'],
    rep: { t: 'Firewall ACLs and least privilege', w: 'Internet-facing SSH servers get hit by automated password-guessing attacks constantly, often within minutes of going online.', d: 'Allow only the ports a service needs, restrict admin access like SSH to admin networks, and rely on the implicit deny for everything else.' },
  },
  {
    id: 'ite1', code: 'ITE-01', cat: 'ite', pts: 100, kind: 'phish', name: 'Phishing headers', answer: 'riverbendsd-security.com', alt: ['mail.riverbendsd-security.com'],
    desc: 'This email landed in a teacher’s inbox. It says it’s from the district IT team.',
    mission: 'Find the real domain this email came from. Submit flag{domain}.',
    tech: { name: 'Email header analysis', what: 'The From name is easy to fake. The real story is in the headers: Return-Path, Received, and the SPF result show which server actually sent the message.', ex: 'Open the original message to see the full headers.' },
    cert: 'CompTIA A+: social engineering and email security',
    hints: ['Look at Return-Path and the first Received line.', 'SPF failed, so the message didn’t really come from riverbendsd.org. Which domain did it come from?'],
    rep: { t: 'Email header analysis', w: 'Phishing is one of the most common ways attacks begin, and look-alike domains are a favorite trick because the name looks right at a glance.', d: 'Use SPF, DKIM, and DMARC to reject spoofed mail, warn users about external senders, and teach people to report messages instead of clicking.' },
  },
  {
    id: 'ite2', code: 'ITE-02', cat: 'ite', pts: 200, kind: 'linux', name: 'Terminal hunt', gen: () => 'LINUX-' + rnd(4),
    desc: 'An IT tech left a note somewhere on this Linux computer about where the Wi-Fi admin password got saved.',
    mission: 'Find the Wi-Fi admin password saved on this machine.',
    tech: { name: 'Linux command line', what: 'ls lists files, but hidden files start with a dot and only show up with ls -a. cd moves between folders, cat shows what’s in a file, and grep searches inside a file.', ex: 'Start with ls -a in your home folder.' },
    cert: 'CompTIA A+: Linux command line',
    hints: ['Hidden files start with a dot. Try ls -a.', 'Read the hidden note with cat. It points you to a folder.', 'The log is too long to read. Search it with grep, like: grep wifi /var/log/syslog'],
    rep: { t: 'Linux command line', w: 'Passwords left in notes, scripts, and logs are one of the first things attackers search for after they break in, using the same commands you just used.', d: 'Never store passwords in notes or logs, use a password manager, and lock down file permissions on sensitive files.' },
  },
  {
    id: 'ite3', code: 'ITE-03', cat: 'ite', pts: 200, kind: 'logs', name: 'Log detective', answer: '198.51.100.73',
    desc: 'Riverbend’s file server had a busy night. Here’s its SSH login log.',
    mission: 'Find the IP of the attacker who actually got in. Submit flag{IP}.',
    tech: { name: 'Log analysis', what: 'Brute-force attacks show up as many failed logins from one IP. The dangerous ones end with an “Accepted” line, which means the attacker guessed right.', ex: 'Search the log for Accepted, then check which IPs aren’t normal admins.' },
    cert: 'CompTIA A+ and Network+: reviewing logs and security events',
    hints: ['Two IPs have lots of failed logins. Only one of them ever succeeded.', 'Search for Accepted. 10.10.5.20 is the normal IT admin.'],
    rep: { t: 'Log analysis', w: 'Spotting many failed logins followed by a success is a core task for SOC analysts, and it’s often the first sign that an account was compromised.', d: 'Lock accounts or slow down logins after repeated failures, require MFA, use SSH keys instead of passwords, and alert on failures followed by a success.' },
  },
  {
    id: 'q1', code: 'QF-01', cat: 'quick', pts: 200, kind: 'subnet', name: 'Subnetting speed round', gen: () => 'SUBNET-' + rnd(4),
    desc: 'Quick-fire round. Answer subnetting questions until you get three right in a row. A wrong answer resets your streak.',
    mission: 'Get three subnets right in a row.',
    tech: { name: 'IPv4 subnetting', what: 'The prefix decides how big each network is. For /24 to /30, only the last number changes: block size = 256 minus the last mask number, and networks start at multiples of the block size.', ex: 'A /26 mask is 255.255.255.192, so the block size is 64 and networks start at .0, .64, .128, and .192.' },
    cert: 'CompTIA Network+ and Cisco CCST: IPv4 subnetting',
    hints: ['Usable hosts = 2 to the power of (32 minus the prefix), minus 2.', 'The broadcast address is the last address in the block, one less than the next network.'],
    rep: { t: 'IPv4 subnetting', w: 'Network admins subnet constantly: assigning address ranges to VLANs, writing firewall rules, and troubleshooting. Segmenting a network also limits how far an attacker can move after getting in.', d: 'Separate students, staff, servers, and devices like cameras into their own subnets, and control traffic between them with ACLs.' },
  },
]

export const ALL: Challenge[] = [...AI_TARGETS, ...TOOLS]
export const byId = (id: string | null) => ALL.find(c => c.id === id)
export const catOf = (c: Challenge) => CATS.find(k => k.id === c.cat)!
export const HINT_COST: Record<number, number> = { 100: 25, 200: 35, 300: 50 }
