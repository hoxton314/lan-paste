# iOS Shortcuts for LAN Paste

These shortcuts let you push/pull clipboard content from your iPhone or iPad without opening the web UI. They work via the Share Sheet, widgets, and Siri.

**Prerequisites**: Your iOS device must be on the same Tailscale network as the server.

Replace `SERVER_URL` below with your server's Tailscale IP and port, e.g. `http://100.64.0.1:3456`.

---

## Shortcut 1: Push to LAN Paste

Sends text or images from the Share Sheet (or clipboard) to the server.

### Setup

1. Open **Shortcuts** app > tap **+** > name it **"Push to LAN Paste"**
2. Tap **"Add Action"** and build the following flow:

### Actions

```
Receive [Text, Images, URLs] input from [Share Sheet]

If [Shortcut Input] [has any value]:
    Set variable [Content] to [Shortcut Input]
Otherwise:
    Get Clipboard
    Set variable [Content] to [Clipboard]
End If

If [Content] [is] [Image]:
    Get Contents of URL
        URL: SERVER_URL/api/clips
        Method: POST
        Request Body: Form
            device_id (Text): iphone-shortcut
            device_name (Text): iPhone
            image (File): [Content]

Otherwise:
    Get Contents of URL
        URL: SERVER_URL/api/clips
        Method: POST
        Headers:
            Content-Type: application/json
        Request Body: JSON
            {
                "type": "text",
                "content": [Content],
                "device_id": "iphone-shortcut",
                "device_name": "iPhone"
            }
End If

Show Notification "Pushed to LAN Paste"
```

### Usage
- **Share Sheet**: Select text/image in any app > Share > "Push to LAN Paste"
- **Widget**: Add to Home Screen widget for one-tap clipboard push
- **Siri**: "Hey Siri, Push to LAN Paste"

---

## Shortcut 2: Pull from LAN Paste

Gets the latest clip from the server and copies it to your clipboard.

### Setup

1. Open **Shortcuts** app > tap **+** > name it **"Pull from LAN Paste"**
2. Build the following flow:

### Actions

```
Get Contents of URL
    URL: SERVER_URL/api/clips/latest
    Method: GET

Get Dictionary Value [type] from [Contents of URL]
Set variable [ClipType] to [Dictionary Value]

If [ClipType] [is] [text]:
    Get Dictionary Value [content] from [Contents of URL]
    Copy to Clipboard [Dictionary Value]
    Show Notification "Copied: [Dictionary Value]"

Otherwise:
    Get Dictionary Value [image_url] from [Contents of URL]
    Get Contents of URL
        URL: SERVER_URL[Dictionary Value]
        Method: GET
    Copy to Clipboard [Contents of URL]
    Show Notification "Image copied to clipboard"
End If
```

### Usage
- **Widget**: One-tap pull from any screen
- **Siri**: "Hey Siri, Pull from LAN Paste"
- **Home Screen**: Add as icon for quick access

---

## Shortcut 3: LAN Paste History (Optional)

Browse recent clips and pick one to copy.

### Actions

```
Get Contents of URL
    URL: SERVER_URL/api/clips?limit=10
    Method: GET

Get Dictionary Value [clips] from [Contents of URL]
Repeat with Each [item] in [Dictionary Value]:
    Get Dictionary Value [device_name] from [Repeat Item]
    Get Dictionary Value [type] from [Repeat Item]
    Get Dictionary Value [content] from [Repeat Item]
    Set variable to "[device_name]: [content]"
End Repeat

Choose from List [Repeat Results]

// Get the selected clip's content
Get Dictionary Value [content] from [Chosen Item]
Copy to Clipboard [Dictionary Value]
Show Notification "Copied!"
```

---

## Tips

- **API Key**: If you've set `LAN_PASTE_API_KEY` on the server, add `?api_key=YOUR_KEY` to each URL, e.g. `SERVER_URL/api/clips?api_key=YOUR_KEY`
- **Automation**: You can trigger shortcuts automatically — e.g. when connecting to your home WiFi
- **Back Tap**: Assign a shortcut to iPhone Back Tap (Settings > Accessibility > Touch > Back Tap) for instant push/pull
- **Action Button**: On iPhone 15 Pro+, assign to the Action Button
- **Lock Screen Widget**: Add shortcuts to Lock Screen for pull without unlocking
