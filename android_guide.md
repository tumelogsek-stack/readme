# 📱 Android Setup Guide for Tauri 2.0

To run your BookApp on Android, follow these steps to set up your development environment.

## 1. Prerequisites

### Install Android Studio

- Download and install [Android Studio](https://developer.android.com/studio).
- During installation, ensure you install:
  - **Android SDK**
  - **Android SDK Platform** (API level 33 or 34 recommended)
  - **Android Virtual Device** (if you don't have a physical phone)

### Setup SDK & NDK

1. Open Android Studio -> **Settings** -> **Languages & Frameworks** -> **Android SDK**.
2. Go to **SDK Tools** tab.
3. Check and install:
   - **Android SDK Build-Tools**
   - **NDK (Side by side)**
   - **CMake**
   - **Android SDK Command-line Tools**

---

## 2. Environment Variables

You need to tell Tauri where your Android tools are. Add these to your System Environment Variables:

- `JAVA_HOME`: Path to your JDK (e.g., `C:\Program Files\Android\Android Studio\jbr`)
- `ANDROID_HOME`: Path to your SDK (usually `%LOCALAPPDATA%\Android\Sdk`)
- `NDK_HOME`: Path to your NDK (usually `%ANDROID_HOME%\ndk\<version>`)

_Add `%ANDROID_HOME%\platform-tools` to your system `PATH`._

---

## 3. Rust Setup

Tauri needs the mobile targets for Rust. Run these in your terminal:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

---

## 4. Initialize & Run

### Initialize Android

In your project folder (`book-app`), run:

```powershell
pnpm tauri android init
```

This will create the `src-tauri/gen/android` folder with the necessary native code.

### Run on Device/Emulator

#### 1. Start the Android Emulator

If you don't have a physical device connected, follow these steps to start an emulator:

1.  **Open Android Studio**.
2.  On the Welcome Screen (or via `Tools` -> `Device Manager`), open the **Device Manager**.
3.  If you have an existing device (e.g., "Pixel 7 API 33"), click the **Play** button ( треугольник ) to start it.
4.  **If you don't have one:**
    - Click **Create device**.
    - Choose a phone (e.g., Pixel 7) and click **Next**.
    - Select a System Image (e.g., API 33) and download it if necessary.
    - Click **Next**, then **Finish**.
    - Now click the **Play** button for your new device.

#### 2. Run the App

Once the emulator has booted up and reached the home screen:

In your project folder (`book-app`), run:

```powershell
pnpm tauri android dev
```

---

## 💡 Important Considerations for Android

### File Access

Because Android is more restrictive with files than Windows, our current "drag and drop" logic might need refinement for mobile. You'll likely want to use the **Tauri Dialog Plugin** to pick files from the Android file system.

### Performance

The masonry grid and EPUB rendering are performance-intensive. Testing on a physical device is highly recommended to ensure smooth animations!
