# n8n-nodes-wamatrix

This is an n8n community node package for [WaMatrix](https://wamatrix.io), a WhatsApp Business messaging platform. Use it to send WhatsApp messages and templates, keep contacts in sync with your CRM, read conversations, run WhatsApp OTP verification, and start workflows when customers message you.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [WaMatrix node](#wamatrix-node)
- [WaMatrix Trigger](#wamatrix-trigger)
- [Example workflows](#example-workflows)
- [Things to know about WhatsApp](#things-to-know-about-whatsapp)
- [Compatibility](#compatibility)
- [Development](#development)
- [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install `n8n-nodes-wamatrix`.

## Credentials

You need a WaMatrix workspace on a plan that includes API access.

1. In your WaMatrix dashboard, open **Settings → API Keys** and create a key.
2. Grant the scopes for what you plan to use:

    | You want to… | Scopes |
    | --- | --- |
    | Send messages and templates | `messages:send`, `channels:read`, `templates:read`, `contacts:read`, `contacts:write` |
    | Check delivery of a sent message | `messages:read` |
    | Manage contacts and groups | `contacts:read`, `contacts:write`, `groups:read`, `groups:write`, plus `statuses:read`, `sources:read`, `labels:read` for the dropdowns |
    | Read conversations | `conversations:read` |
    | Send and verify OTP codes | `otp:send`, `otp:verify`, `channels:read`, `templates:read` |
    | Use the WaMatrix Trigger | `webhooks:read`, `webhooks:write` |

3. In n8n, create a **WaMatrix API** credential and paste the key into **API Token**. n8n checks it against the API when you save.

| Field | When to change it |
| --- | --- |
| API Token | Always required |
| API URL | Leave as `https://api.wamatrix.io` unless your workspace uses a different API host |
| Webhook Signing Secret | Only for the trigger's **Manual** registration mode (see below) |

## WaMatrix node

| Resource | Operations |
| --- | --- |
| Message | Send Text, Send Template, Get |
| Contact | Create, Create or Update, Get, Get Many, Update, Delete |
| Contact Group | Add Contact, Remove Contact, Get Members, Get Many |
| Conversation | Get Many, Get Messages |
| Template | Get, Get Many, Sync |
| Channel | Get, Get Many |
| OTP | Send, Verify, Get Status |

The node can also be used as a tool by the n8n AI Agent.

### Sending messages

- **WhatsApp Number** lists the numbers connected to your workspace.
- **Send To → Phone Number** finds the contact by phone number. With **Create Contact If Missing** on (the default), a new contact is created, so you can send straight from a CRM or form submission.
- **Send To → Existing Contact** lets you search contacts by name or phone.
- **Send Template**: choose an approved template, then fill its variables:
    - **Header**: a text variable, or a public HTTPS link for an image, video or document header.
    - **Body Variables**: values for `{{1}}`, `{{2}}`, … in order.
    - **URL Button Variables**: the dynamic end of a URL button, by button position (starting at 0).
    - Or switch **Variables Input** to **Using JSON** and pass the WhatsApp Cloud API `components` array yourself.

    If the counts don't match the template, WaMatrix answers with the exact parameters it expects.
- A send returns as soon as WaMatrix accepts it (`status: queued`). To know whether it was delivered or read, use **Message → Get** with the returned `id`, or the trigger's **Message Status Updated** event.

### Contacts

- **Create or Update** matches on phone number: it updates the contact that has it, or creates one. Use this to sync contacts from a CRM.
- Phone numbers are accepted in any common format (`+91 98765 43210`, `919876543210`) and stored as `+919876543210`.
- Groups, labels and custom fields you set on **Update** replace the contact's current ones.

### OTP

**Send** generates a code and delivers it with an approved template in the **Authentication** category. It returns a `reference`. **Verify** takes that reference and the code the user entered. It returns `verified: true` or `verified: false` with a `reason` (`invalid_code`, `otp_expired`, `max_attempts_reached`, `already_verified`, `otp_cancelled`), so you can branch with an **If** node instead of handling errors.

### Errors

WaMatrix errors keep their message and `error_code`, for example:

| `error_code` | Meaning |
| --- | --- |
| `window_expired` | A text send outside the 24-hour window. Send a template instead. |
| `invalid_template` / `template_channel_mismatch` | The template isn't approved, or belongs to another WhatsApp account. |
| `invalid_template_params` | Variable counts don't match the template. The message lists what's needed. |
| `contact_opted_out` | The contact opted out of marketing messages. |
| `recipient_blocked` | You blocked this customer on that number. |
| `conversation_limit_reached` | Your plan's monthly conversation limit is used up. |
| `send_rate_limited` | Too fast for the number's WhatsApp rate. Retry later. |

Turn on the node setting **On Error → Continue** to route failed items onward instead of stopping the workflow.

## WaMatrix Trigger

Starts a workflow when:

| Event | Fires when | Main fields |
| --- | --- | --- |
| Message Received | A customer messages one of your numbers | `from`, `contact_name`, `type`, `text`, `reply_id`, `media`, `message_id` |
| Message Status Updated | A sent message is sent, delivered, read or failed | `message_id`, `status`, `recipient`, `error_code`, `error_message` |
| Template Status Updated | Meta approves, rejects or pauses a template | `template_name`, `status`, `reason` |
| Template Quality Updated | A template's quality rating changes | `template_name`, `previous_quality`, `quality` |
| All Other Events | Any other WhatsApp webhook event (calls, account updates, flows, …) | `event`, `payload` |

A single WhatsApp delivery can hold several messages or statuses; each becomes its own item. Every item also has `phone_number_id`, `business_phone_number`, `channel_id`, `workspace_id` and the untouched WhatsApp object in `raw`.

`text` holds the readable part of any message: the body of a text, the caption of media, the title of a tapped button or list row, a reaction emoji, or a location's name and address. `reply_id` is the ID of the button or list row the customer tapped.

### Registration

- **Automatic** (default): when you activate the workflow, or click **Listen for test event**, the trigger registers its URL in WaMatrix and receives a signing secret. When you deactivate it, the registration is removed. Every request is checked against that secret, and unsigned or tampered requests are rejected with `401`. Needs the `webhooks:read` and `webhooks:write` scopes.
- **Manual**: for workspaces where automatic registration isn't available. Copy the trigger's **Production URL** into **Settings → Webhook Forwarding** in WaMatrix, choose method **POST**, and tick **Messages** (for message events) and any template events you need. To verify requests, set a secret there and put the same value in the credential's **Webhook Signing Secret**. Webhook Forwarding has one URL per workspace, so this replaces any URL already set there.

**Reject Requests Older Than** adds replay protection based on the signed timestamp. Leave room for WaMatrix's retries, which can arrive about two minutes late.

## Example workflows

Import any file from [`examples/`](examples) with **Workflow → Import from File**:

| File | What it does |
| --- | --- |
| `auto-reply-keywords.json` | Replies to incoming messages based on keywords; hands everything else to a human |
| `crm-sync-and-welcome.json` | Webhook from a CRM or form → Create or Update contact → welcome template |
| `delivery-failure-alert.json` | Message Status Updated (failed) → posts the failure to your team |
| `otp-login.json` | Two webhooks: one sends an OTP, the other verifies it and answers true or false |

## Things to know about WhatsApp

- **24-hour window**: you can send free-form text only within 24 hours of the customer's last message. Outside it, send an approved template.
- **Templates** must be approved by Meta first. Use **Template → Sync** after creating or editing one in WhatsApp Manager.
- **Opt-in**: only message customers who agreed to hear from you. WaMatrix blocks marketing templates to contacts who opted out.

## Compatibility

- n8n 1.x with Node.js 22 or later.
- No runtime dependencies.

## Development

```bash
npm install
npm run dev     # n8n at http://localhost:5678 with this package loaded and hot reload
npm run lint
npm test        # builds, then runs the unit tests
npm run e2e     # runs real n8n against a local mock of the WaMatrix API
```

Releases are published from GitHub Actions with npm provenance (`.github/workflows/publish.yml`). Run `npm run release` to bump the version, update the changelog, tag and push. The full first-release and n8n verification steps are in [PUBLISHING.md](PUBLISHING.md).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [WaMatrix API reference](https://api.wamatrix.io/docs)
- [WhatsApp message templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)

## License

[MIT](LICENSE.md)
