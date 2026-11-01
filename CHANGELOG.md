# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses [Semantic Versioning](https://semver.org/):

- **Patch**: bug fixes, wording, no change to node parameters or output.
- **Minor**: new resources, operations, fields or trigger events. Existing workflows keep working.
- **Major**: a renamed or removed parameter, or a changed output shape. Ships as a new node version so saved workflows keep their behaviour.

## [0.1.0] - unreleased

### Added

- **WaMatrix** node
    - Message: Send Text, Send Template (header, body and URL-button variables, or raw components JSON), Get.
    - Send to a phone number: finds the contact, or creates it when missing.
    - Contact: Create, Create or Update (matched on phone number), Get, Get Many, Update, Delete.
    - Contact Group: Add Contact, Remove Contact, Get Members, Get Many.
    - Conversation: Get Many, Get Messages.
    - Template: Get, Get Many, Sync.
    - Channel: Get, Get Many.
    - OTP: Send, Verify (returns `verified` true or false), Get Status.
    - Dropdowns for WhatsApp numbers, templates, groups, labels, statuses and sources; searchable contact picker.
    - Usable as an AI Agent tool.
- **WaMatrix Trigger**: Message Received, Message Status Updated, Template Status Updated, Template Quality Updated and All Other Events. Registers its own webhook with a per-subscription signing secret, or works with a manually configured Webhook Forwarding URL. HMAC-SHA256 signature check and optional replay window.
- **WaMatrix API** credential with a connection test.
