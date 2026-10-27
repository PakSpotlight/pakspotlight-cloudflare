# Classic TV Pakistan — Android TV build

This is a separate Android TV variant of the existing React Native app. It uses a different
application ID (com.classictvpakistan.tv) from the phone app (com.classictvpakistan.app), so
the two apps can be installed side by side.

## Safety boundaries

- The TV app reads the existing public Supabase catalogue only; it does not write to the database.
- The website and its deployment are not changed by this build.
- The TV workflow is manual-only. It builds an APK artifact and does not create a release or edit
  public/app/latest.json.
- The ordinary phone build remains the default when CLASSIC_TV_ANDROID_TV is not set.

## Build a TV APK

1. Open Actions → Android TV APK in GitHub.
2. Select Run workflow on the feature/android-tv-apk branch.
3. Download the resulting artifact from the completed workflow run.
4. Install it on a test Android TV device before distributing it.

If signing secrets are not configured, the workflow creates an unsigned smoke-test APK. Android
will not allow it to update a signed installation; do not distribute it.

## Current milestone

The TV variant has a landscape orientation, Android TV Leanback launcher declaration, and a
separate package ID. This is the build/installation foundation, not yet a guarantee of full
remote-control navigation or playback on every TV. The next milestone is to add and test clear
DPAD focus states and remote navigation across Home, Browse, programme details, and playback.
The YouTube player must retain its existing fallback to the YouTube app.
