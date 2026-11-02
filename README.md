# PocketPush

**Current release: 1.1.2** — refined typography, a more compact Send All action, and simpler PC address entry.

**PocketPush** is a deliberately simple Android-to-Windows folder sender. Pick phone folders once, then send their current contents to one Windows folder with one button.

This release improves desktop readability, makes the Send All button more compact, and simplifies PC address entry. Enter only the PC IP address (for example, `192.168.1.104`); PocketPush adds `http://` and port `8765` automatically. You can also paste the full address printed by Windows. Existing installs retain their saved folders and connection settings.

- Android side: installable Progressive Web App (PWA), designed for current Chrome on Android.
- Windows side: a small PowerShell receiver included in this folder.
- Transfer: direct HTTP over your local Wi-Fi/LAN.
- Hosting: the PWA's static files can be hosted free (for example, GitHub Pages). The receiver and file transfers remain local.
- No accounts, cloud backend, sync engine, transfer database, or automatic phone-side deletion.

## What it does

1. Remembers selected Android source-folder handles in the browser's local IndexedDB.
2. Reads the current contents of enabled folders when you press **SEND ALL**.
3. Uploads each file directly to the Windows receiver.
4. Saves files flat into the configured Windows destination folder.
5. If a filename already exists, the receiver creates `name (1).ext`, `name (2).ext`, etc. It never silently overwrites an existing file.
6. Optionally lets you preview a batch and untick files to skip for that run.
7. If a transfer partially fails, the app offers **Retry failed files** while it remains open. This short-lived retry list is held only in memory and is discarded when the app closes or a new batch starts.

It intentionally does **not** remember what has been sent before. Files left on the phone are sent again on the next run. Phone originals are never deleted.

## Requirements

- Android with a current Chromium-based browser supporting the File System Access API. Current Chrome for Android is the target browser.
- A Windows 10/11 PC and phone connected to the same ordinary home Wi-Fi/LAN (not a guest network with client isolation).
- Windows PowerShell 5.1 or newer (included with Windows).
- **Chrome 142 or newer on Android is required** for the HTTPS PWA to contact the local HTTP receiver using Chrome's Local Network Access permission flow.

## Updating an existing installation

If you already run PocketPush 1.1.1, this is a **web-only update**. You do not need to change Windows, re-pair, or reselect your Android folders.

1. Replace the `web` folder in your GitHub repository with the `web` folder from this package, then commit and push.
2. Wait for GitHub Pages to finish deploying, then reopen PocketPush on Android. The service worker will replace its previous cached app files.
3. Your saved PC address, pairing key, and folder handles remain intact. The address is now displayed as a plain IP; port `8765` is added automatically.

For older PhonePush installations, the legacy browser storage identifiers and receiver HTTP header are still retained, so the PWA can also be updated in place. Keep your Windows `settings.json` untouched. The existing Windows receiver does not need to be replaced for this release.

The older `Start-PhonePush.cmd` and `Install-Windows-Setup.cmd` launchers remain usable. The `X-PhonePush-Token` header and IndexedDB names are intentionally retained internally for compatibility.

## Part A — publish the PWA (free static hosting)

The PWA needs an HTTPS origin to access Android folders and connect to your local receiver. The easiest route is free GitHub Pages. GitHub Pages hosts only the static app files; no phone files are uploaded to GitHub.

1. Use your existing GitHub repository: [Vraxo/PocketPush](https://github.com/Vraxo/PocketPush).
2. Put the contents of this project folder in the repository root. Keep the `web` folder and `.github/workflows/pages.yml` in their existing locations.
3. In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**.
4. Push to the `main` branch (or use **Actions → Deploy PocketPush PWA → Run workflow**). The included workflow publishes the contents of `web`.
5. Open the resulting `https://vraxo.github.io/PocketPush/` address in Chrome on Android.
6. In Chrome's menu, choose **Add to Home screen** or **Install app**.

After the first successful visit, the service worker caches the app shell. The installed PWA can open offline. Internet is only needed for the initial visit/install and later app updates. The Windows receiver and the files transferred never use GitHub Pages.

> If you host the PWA at a different static HTTPS host, publish the **contents of `web`** as the site root. No server-side runtime is needed.

## Part B — prepare Windows (one time)

1. Copy the `windows` folder to a permanent location on your PC, e.g. `C:\\Tools\\PocketPush`.
2. Double-click `Install-PocketPush.cmd`. Approve the administrator prompt. This creates:
   - an HTTP.sys URL reservation for the current Windows account on port `8765`;
   - a Windows Firewall inbound rule for TCP `8765`, limited to the **Private** profile and the local subnet.
3. If Windows marks your trusted home network as **Public**, change it to **Private** in **Settings → Network & Internet → Wi-Fi/Ethernet → your connected network → Network profile type**.
4. Double-click `Start-PocketPush.cmd` normally (not as administrator).
5. On first launch, enter your desired PC destination directory. For example, you can enter the same folder you currently use for LocalSend. Press Enter to use an `Incoming` folder alongside the receiver scripts.
6. The receiver prints one or more addresses such as `http://192.168.1.100:8765` and a long pairing key. Keep this window open while sending.

The first run creates `windows/settings.json` containing the destination and pairing key. Keep this file private. The pairing key is a local shared secret; anyone who has it and can reach the receiver can upload files into the destination folder.

## Part C — pair Android and choose folders

1. Open the installed PocketPush app.
2. Enter one of the receiver URLs printed in the Windows console, e.g. `http://192.168.1.100:8765`.
3. Enter the pairing key printed by the receiver.
4. Tap **Test connection**. Chrome may ask whether PocketPush can access devices on your local network. Allow it.
5. Tap **Add source folder** and choose a phone folder (e.g. `DCIM/Camera`). Repeat for other folders.
6. Leave the desired folders enabled. Tap **SEND ALL**.

The first time you use a saved folder handle after a browser restart, Chrome may ask you to renew its read permission. The **Access** button beside each folder can renew it.

## Everyday use

1. Start `Start-PocketPush.cmd` on Windows.
2. Open PocketPush on Android.
3. Tap **SEND ALL**.
4. Keep the Windows receiver window open until the transfer finishes.

The **Review before sending** option is off by default, so the normal workflow is one button. Turn it on for an exceptional run: the app scans the enabled folders, shows the current files, and lets you untick anything to skip just for that run. Those exclusions are not saved.

**Include subfolders** is on by default. Turn it off if you only want files directly inside each selected folder.

## Security and privacy

- The Windows receiver listens on all network interfaces on port `8765`, but Windows Firewall only permits inbound connections from the local subnet while the active network profile is Private.
- Every health check and upload requires the pairing key. The key is stored in `windows/settings.json` and in the PWA's local browser storage.
- The receiver does not expose a file listing, download endpoint, or remote file browser.
- **V1 uses plain HTTP on the LAN, not end-to-end encrypted transport.** The pairing key controls access but does not encrypt file contents. Use a trusted WPA2/WPA3 home network, not public Wi-Fi.
- Use this only on a trusted private network. Do not forward port `8765` from your router or expose it to the internet.
- The PWA's HTTPS host serves static code only. Upload requests go directly from your phone to the PC's private IP address.

## Troubleshooting

**The app says it cannot reach the receiver**

- Confirm the Windows console is still open and says `Receiver is running`.
- Use the exact current `http://...:8765` address printed by the receiver. The PC's address can change after reconnecting to Wi-Fi.
- Make sure both devices are on the same non-guest Wi-Fi/LAN.
- Confirm the Windows network profile is Private.
- Run `Install-PocketPush.cmd` if the firewall rule or URL reservation was not configured.
- In Chrome, check the installed site's permissions and allow **Local network** access.

**Folder access needs renewal**

Tap **Access** beside the relevant source folder. If that fails, remove and add the folder again.

**A file arrived with `(1)` in its name**

A file with that name already existed in the destination. PocketPush avoids overwriting it. It does not attempt to determine whether the existing file is identical.

**The app does not offer a folder picker**

Open it in current Chrome for Android, from its HTTPS address or installed PWA. Opening `index.html` directly as a `file://` URL is not supported.

## Project layout

- `web/` — static PWA.
- `windows/Start-PhonePush.ps1` — Windows HTTP receiver (legacy filename retained for existing installations).
- `windows/Start-PocketPush.cmd` — branded receiver launcher.
- `windows/Install-Windows-Setup.ps1` — one-time URL reservation and firewall setup.
- `windows/Install-PocketPush.cmd` — branded setup launcher.
- `.github/workflows/pages.yml` — optional free GitHub Pages deployment workflow.

## Limitations of v1

- Files are uploaded one at a time. This keeps memory use low and makes failure reporting simple.
- Folders are flattened into the single destination directory. Duplicate names are automatically renamed rather than overwritten.
- The app does not preserve the source subfolder tree on the PC.
- No file history or deduplication exists by design.
- Large transfers require the PWA tab to remain open and the phone to stay awake. Android may pause background tabs; keep PocketPush in the foreground until it finishes.
- No background or automatic retry is attempted. The app offers a manual **Retry failed files** button for the failed items from the current run; if the app closes, those temporary retry details are discarded.

## License

MIT. See `LICENSE`.
