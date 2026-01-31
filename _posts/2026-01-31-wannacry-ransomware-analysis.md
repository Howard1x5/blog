---
layout: post
title: "WannaCry Ransomware Analysis"
date: 2026-01-31
categories: [ malware ]
permalink: /malware/wannacry-analysis/
tags: [malware-analysis, wannacry, ransomware, procmon, homelab]
image: assets/images/malware/wannacry/02-ransom-screen.png
---

After validating the lab setup with EICAR, I wanted to detonate actual malware to test the isolation and observe real behavior through the monitoring tools. WannaCry seemed like a reasonable choice - it's well-documented, the behavior is predictable, and it exercises both file system and network activity.

## Sample Information

- **SHA256:** `ed01ebfbc9eb5bbea545af4d01bf5f1071661840480439c6e5babe8e080e41aa`
- **Size:** 3.5 MB
- **Source:** theZoo repository
- **Archive Password:** `infected`

## Environment

FLARE VM on an isolated network segment (192.168.100.0/24) with no route to the internet or my home LAN. Verified isolation by confirming failed pings to 8.8.8.8 and the home gateway before execution.

## Defender Interference

Windows Defender put up more resistance than expected. Even with real-time monitoring disabled and folder exclusions in place, it kept quarantining the sample.

![Defender Fighting](/assets/images/malware/wannacry/01-defender-fighting.png)

Procmon showed MsMpEng.exe continuously scanning the Samples directory. Had to disable Defender via registry policies to get the sample to actually run:

```
HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\DisableAntiSpyware = 1
```

Worth noting for future analysis - on a dedicated analysis VM, it probably makes sense to disable Defender entirely from the start rather than fighting with exclusions.

## Execution

Once Defender was out of the way, WannaCry executed and displayed the expected ransom interface:

![WannaCry Ransom Screen](/assets/images/malware/wannacry/02-ransom-screen.png)

Standard WannaCry behavior:
- $300 Bitcoin demand, doubling after 3 days
- 7-day countdown before "permanent" file loss
- Multi-language support
- Bitcoin address: `13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94`

## File Encryption

Checked the Documents folder and found the expected artifacts:

![Encrypted Files](/assets/images/malware/wannacry/03-encrypted-files.png)

- `@Please_Read_Me@.txt` - Ransom note
- Files with `.WNCRY` extension - encrypted originals

The encryption happened quickly. Most user-accessible files were hit within the first minute of execution.

## Network Activity

TCPView showed SMB (445) connection attempts as WannaCry tried to propagate via EternalBlue. With no other hosts on the isolated segment and no internet access, these went nowhere.

The kill switch domain lookup also failed due to network isolation. In the 2017 outbreak, WannaCry checked for `iuqerfsodp9ifjaposdfjhgosurijfaewrwergwea.com` before encrypting - if the domain resolved, it would exit. Since my VM had no DNS access, this check failed and encryption proceeded.

## IOCs

**File Indicators:**
- `@Please_Read_Me@.txt`
- `@WanaDecryptor@.exe`
- `.WNCRY` file extension

**Network Indicators:**
- SMB scanning on TCP 445
- Kill switch domain lookup

**Bitcoin Addresses:**
- `13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94`

## Recovery

Restored the VM from snapshot:

```bash
qm stop 110 && qm rollback 110 before-wannacry && qm start 110
```

Back to clean state in under two minutes.

## Notes

The isolated environment worked as intended - WannaCry had nowhere to spread and no way to phone home. Procmon and TCPView provided clear visibility into the file and network activity.

For future analysis, I'll probably create a snapshot with Defender already disabled to avoid the back-and-forth. The exclusion approach isn't reliable for known malware signatures.

---

*Sample from theZoo repository. Analysis performed on isolated FLARE VM.*
