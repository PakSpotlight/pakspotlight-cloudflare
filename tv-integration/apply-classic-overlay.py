#!/usr/bin/env python3
"""Apply the Classic TV Pakistan catalogue-only overlay to a clean SmartTube checkout."""
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

repo = Path.cwd()
smart = Path("smarttube")
app = smart / "smarttubetv"
if not (app / "build.gradle").exists():
    raise SystemExit("SmartTube checkout is missing smarttubetv/build.gradle")

# Keep the upstream SmartTube playback engine and dependencies, but give this build
# its own package identity. The phone APK package is deliberately not reused.
gradle = app / "build.gradle"
text = gradle.read_text()
old = 'applicationId "org.smarttube.stable"'
if text.count(old) != 1:
    raise SystemExit("Could not safely locate SmartTube stable applicationId")
gradle.write_text(text.replace(old, 'applicationId "com.classictvpakistan.tv"', 1))

# New native launcher screen: the existing SmartTube home/search/menu is not launched.
src = repo / "tv-integration" / "CatalogActivity.java"
dest = app / "src/main/java/com/classictvpakistan/tv/CatalogActivity.java"
dest.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(src, dest)

# Update launcher label.
strings = app / "src/main/res/values/strings.xml"
xml = ET.parse(strings)
root = xml.getroot()
for item in root.findall("string"):
    if item.attrib.get("name") == "app_name":
        item.text = "Classic TV Pakistan"
xml.write(strings, encoding="utf-8", xml_declaration=True)

# Make the catalogue screen the only main/Leanback launcher entry.
manifest = app / "src/main/AndroidManifest.xml"
tree = ET.parse(manifest)
root = tree.getroot()
android = "{http://schemas.android.com/apk/res/android}"
application = root.find("application")
if application is None:
    raise SystemExit("AndroidManifest has no application element")

for activity in list(application.findall("activity")):
    if activity.attrib.get(android + "name", "").endswith(".SplashActivity"):
        for intent in list(activity.findall("intent-filter")):
            actions = [x.attrib.get(android + "name") for x in intent.findall("action")]
            if "android.intent.action.MAIN" in actions:
                activity.remove(intent)

for activity in list(application.findall("activity")):
    if activity.attrib.get(android + "name") == "com.classictvpakistan.tv.CatalogActivity":
        application.remove(activity)

activity = ET.SubElement(application, "activity", {
    android + "name": "com.classictvpakistan.tv.CatalogActivity",
    android + "exported": "true",
    android + "screenOrientation": "landscape",
    android + "configChanges": "screenSize|smallestScreenSize|screenLayout|orientation|layoutDirection"
})
intent = ET.SubElement(activity, "intent-filter")
ET.SubElement(intent, "action", {android + "name": "android.intent.action.MAIN"})
ET.SubElement(intent, "category", {android + "name": "android.intent.category.DEFAULT"})
ET.SubElement(intent, "category", {android + "name": "android.intent.category.LAUNCHER"})
ET.SubElement(intent, "category", {android + "name": "android.intent.category.LEANBACK_LAUNCHER"})
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
ET.register_namespace("tools", "http://schemas.android.com/tools")
tree.write(manifest, encoding="utf-8", xml_declaration=True)

# Replace SmartTube's launcher artwork with the existing Classic TV Pakistan icon.
icon_source = repo / "mobile/assets/icon.png"
if not icon_source.exists():
    raise SystemExit("Classic TV Pakistan icon not found at mobile/assets/icon.png")
icon = Image.open(icon_source).convert("RGBA")
icon_files = [p for p in (app / "src/main/res").rglob("app_icon.*") if p.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg")]
if not icon_files:
    raise SystemExit("Could not find SmartTube mipmap app_icon resources")
for target in icon_files:
    target.parent.mkdir(parents=True, exist_ok=True)
    size = Image.open(target).size\n    resized = icon.resize(size, Image.Resampling.LANCZOS)\n    resized.save(target)

# Build a simple branded Android TV banner using the same project artwork.
banner_files = [p for p in (app / "src/main/res").rglob("app_banner.*") if p.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg")]
for target in banner_files:
    original = Image.open(target)
    w, h = original.size
    canvas = Image.new("RGB", (w, h), (5, 7, 6))
    logo = icon.copy()
    side = int(h * 0.78)
    logo.thumbnail((side, side), Image.Resampling.LANCZOS)
    canvas.paste(logo, (int(h * 0.15), (h - logo.height) // 2), logo)
    draw = ImageDraw.Draw(canvas)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, max(12, int(h * 0.22)))
    draw.text((int(h * 1.15), h // 2), "CLASSIC TV PAKISTAN", fill=(255, 255, 255), font=font, anchor="lm")
    canvas.save(target)

# Keep required MIT attribution with the app source and package it as an asset.
license_source = smart / "LICENSE"
assets = app / "src/main/assets"
assets.mkdir(parents=True, exist_ok=True)
shutil.copy2(license_source, assets / "SmartTube-MIT-LICENSE.txt")

# No SmartTube Firebase project should be compiled into this differently-identified app.
google = app / "google-services.json"
if google.exists():
    google.rename(app / "google-services.json.disabled")

print("Classic TV Pakistan overlay applied. SmartTube playback engine retained; SmartTube catalogue UI is bypassed.")
