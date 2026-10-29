# Install Debrief

Debrief for VS Code comes as one VSIX file for each kind of computer. Each one carries everything Debrief needs, its own Python included, so you don't need Python or anything else installed, and nothing is downloaded when you install Debrief or first start it (NFR-12, DEP-01, DEP-02).

## What you need

- **VS Code 1.95 or later**, installed for you or for everyone on the computer. Debrief needs no administrator rights of its own.
- **Windows 11**, or Windows 10 while VS Code still supports it; **macOS** on Apple silicon or Intel; or **Linux** on a 64-bit Intel or AMD processor.
- About 60 MB to download and 170 MB of disk once installed.

## Choose the right file

| Your computer | File |
| --- | --- |
| Windows 10 or 11 | `debrief-win32-x64-0.1.0.vsix` |
| Mac with Apple silicon (M1 and later) | `debrief-darwin-arm64-0.1.0.vsix` |
| Mac with an Intel processor | `debrief-darwin-x64-0.1.0.vsix` |
| Linux, 64-bit Intel or AMD | `debrief-linux-x64-0.1.0.vsix` |

Not sure which Mac you have? Choose **About This Mac** from the Apple menu: **Chip** says Apple M1 or later, **Processor** says Intel.

The files are on Debrief's [releases page](https://github.com/debrief/fuudee/releases), under **Assets**, or your team may share them. A file for another kind of computer will not install: VS Code says it is not compatible.

## Install it

In VS Code:

1. Open the **Extensions** view: `Ctrl+Shift+X`, or `Cmd+Shift+X` on a Mac.
2. Choose **⋯** (Views and More Actions) at the top of the view, then **Install from VSIX…**.
3. Choose the file you downloaded. VS Code says when Debrief is installed.

Or, from a terminal, with VS Code's `code` command:

```bash
code --install-extension debrief-win32-x64-0.1.0.vsix
```

Debrief's icon appears in the Activity Bar, on the left. The first time it starts, Debrief opens its first walkthrough, *Open and explore a serial*, on a copy of the sample exercise: a good place to begin.

Debrief starts its Python when it starts. On a new installation that takes a few seconds, longer while antivirus software checks the files for the first time.

## Updating and removing

To update, install the newer file the same way: it replaces the version you have. Your catalogues, plots and settings are kept, as they are not part of Debrief's installation.

To remove Debrief, find it in the **Extensions** view and choose **Uninstall**. Your catalogues and plots stay where they are.

## Windows

- Windows 10 and Windows 11 use the same file.
- Debrief installs into your own profile (`%USERPROFILE%\.vscode\extensions`), so it needs no administrator rights, as long as VS Code itself is installed.
- If your organisation's antivirus or application control blocks programs in your profile, ask for Debrief's folder there to be allowed: Debrief starts `python.exe` from it.

## macOS

- Debrief and its Python are not signed or notarised by Apple. VS Code unpacks the file itself, so macOS does not usually check them. If macOS says that `python3.12` cannot be opened, or Debrief says its tools did not start, open **Terminal** and clear the download mark from Debrief's folder:

    ```bash
    xattr -dr com.apple.quarantine ~/.vscode/extensions/debrief.debrief-0.1.0*
    ```

    Then choose **Developer: Reload Window** from the Command Palette (`Cmd+Shift+P`).

## Linux

- The Linux file is for 64-bit Intel and AMD processors, on any distribution VS Code itself supports.
- From the command line, `code --install-extension` works the same as on the other platforms.

## If the tools do not start

The **Tools** view, in Debrief's sidebar, says why, and the Debrief output has more (**View**, **Output**, then choose **Debrief**). Most often it is the macOS download mark above, or antivirus software holding the files. Installing the file again replaces every file of Debrief's.

## For developers

**Debrief: Python** in Settings, or the `DEBRIEF_PYTHON` environment variable, chooses another Python, one with Debrief's Python packages installed (`uv sync` in the source folder). Leave the setting empty to use the Python that comes with Debrief. Running Debrief from its source, nothing is bundled, and it uses `python3` (`python` on Windows) as before. How the files are made is in `vscode/README.md`.
