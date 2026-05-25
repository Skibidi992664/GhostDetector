# Web PWA Prototype (runs in Safari on iPhone)

This web prototype replicates core parts of the sensor-fusion app and can be hosted for free using GitHub Pages. It runs in mobile Safari and uses available browser sensors: DeviceMotion, getUserMedia (audio + camera), and Geolocation.

How to deploy from Windows (free)
1. Create a new public GitHub repository and push the `web/` folder contents to the repository root or a `gh-pages` branch.

```bash
cd path/to/SensorFusionApp/web
git init
git add .
git commit -m "Add PWA prototype"
git branch -M main
git remote add origin https://github.com/yourusername/sensor-fusion-web.git
git push -u origin main
```

2. In the GitHub repo: Settings → Pages → Source: `main` branch, root folder → Save.
3. Wait a minute and open the provided GitHub Pages URL on your iPhone Safari. Tap Share → Add to Home Screen to create an app-like icon.

Windows-friendly push using PowerShell
------------------------------------
I included a helper script `deploy.ps1` that walks you through pushing the `web/` folder to your GitHub repo. Steps:

1. Create an empty public repo on GitHub (do not add README/license) and copy its HTTPS URL.
2. Put `deploy.ps1` inside the `web/` folder on your PC.
3. Open PowerShell, navigate to the `web/` folder, and run:

```powershell
.\
.\\deploy.ps1
```

Follow the prompts to enter your repo URL and Git user info.

If you prefer a GUI, you can also use GitHub Desktop to drag-and-drop the files and publish the repo.

Notes about encryption and privacy
- The page stores saved events in `localStorage`. If you set a passphrase, events are encrypted with AES-GCM using the Web Crypto API. Keep your passphrase safe — if you lose it the data cannot be recovered.

Troubleshooting
- If camera or mic access is blocked, check Safari Settings → Website Settings and allow camera/microphone. Make sure you allow access when prompted.
- If DeviceMotion events are not firing, ensure Motion & Orientation access is enabled in Safari (may require a prompt to allow motion access on iOS 13+).


Permissions & Notes
- The page requires you to allow camera and microphone access when you start monitoring.
- Background sampling is limited — keep the page open in foreground during investigations.
- Not all sensors are available in Safari (e.g., magnetometer, Wi‑Fi RSSI). The prototype degrades gracefully.

If you want, I can:
- (A) Push these web files into a new GitHub repo for you (you'll need to provide the repo name or I can provide instructions). 
- (B) Extend the web app with improved UI, persistent encrypted storage, and improved fusion logic.
