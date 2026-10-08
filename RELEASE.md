# Shipping Huntdeer to the App Store

Everything in the repo is ready (Xcode project, icon, privacy manifest, listing text, screenshots). These steps need you, a Mac with Xcode 16+, and an Apple ID.

## 1. Join the Apple Developer Program
https://developer.apple.com/programs/enroll/ ($99/year). Enroll as an individual unless you want a company name on the store page (needs a D-U-N-S number). Approval can take a day or two.

## 2. Register the app
1. In App Store Connect (https://appstoreconnect.apple.com) > Apps > **+ New App**.
2. Platform iOS, name **Huntdeer**, language English (U.S.), bundle ID **com.abcleanonme.huntdeer** (if it isn't in the list, create it first under Certificates, IDs & Profiles > Identifiers), SKU `huntdeer`.
3. If the name "Huntdeer" is taken, pick a variant (e.g. "Huntdeer: Role Reversal"); the home-screen name stays Huntdeer.

## 3. Build and upload
```bash
npm install
npm run ios:sync
npm run ios:open
```
In Xcode:
1. Select the **App** target > Signing & Capabilities > Team: your developer team. Leave "Automatically manage signing" on.
2. Play it once on a real iPhone and iPad (plug in, pick the device, Run). Check touch controls, saves after relaunch, and the notch.
3. Device menu: **Any iOS Device (arm64)**. Then Product > **Archive**.
4. In the Organizer: **Distribute App** > App Store Connect > Upload.

Version is 1.0 (build 1). For every later upload, bump the build number (App target > General > Build).

## 4. TestFlight (optional, recommended)
Once the build finishes processing (you'll get an email), it shows up under TestFlight. Add yourself as an internal tester and install through the TestFlight app.

## 5. Fill in the listing
Copy from `store/listing.md`:
- Description, keywords, promo text, subtitle, category.
- **Privacy Policy URL** and **Support URL** (both required). The repo is public, so these work as-is once this branch is merged:
  - https://github.com/abcleanonme/huntdeer/blob/HEAD/store/privacy.md
  - https://github.com/abcleanonme/huntdeer/blob/HEAD/store/support.md
- App Privacy: **Data Not Collected**.
- Age rating: answers in `store/listing.md`.
- Screenshots: drag in `store/screenshots/iphone-6.9/*` and `store/screenshots/ipad-13/*`.
- Export compliance is already answered in Info.plist (no encryption), so Apple won't ask.
- Pricing: Free (or set a price; paid apps need the Paid Apps agreement and banking/tax info).

## 6. Submit
Pick the build under "Build", then **Add for Review** > **Submit**. Review usually takes 1 to 3 days. If rejected, the message in Resolution Center says why; most first-time rejections are listing issues, not code.

## Already handled in the repo
- Bundle ID, universal iPhone + iPad, landscape only, full screen, iOS 15+.
- `ITSAppUsesNonExemptEncryption = NO` in Info.plist.
- `PrivacyInfo.xcprivacy` declaring the UserDefaults access used by save data (Apple rejects uploads without it).
- 1024px opaque app icon and splash (`npm run icons`).
- Fonts bundled; no network use, so the app works offline.
