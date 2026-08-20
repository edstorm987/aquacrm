# `src/built-ins/modules/email-sender/src/server/drivers/smtp.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** SMTP driver. Speaks raw SMTP via an injectable transport so the smoke test can assert wire-protocol behaviour without dialing the network. Production wires the default `nodeSmtpTransport` which uses Node's `net` + `tls` directly — no nodemailer dep.  Wire grammar (per-recipient single message): [TLS handshake if secure==="tls"] < 220 server greeting > EHLO <hostname> < 250-... extensions [if secure==="starttls"] > STARTTLS < 220 [TLS handshake] > EHLO <hostname> < 250-... > AUTH LOGIN < 334 base64("Username:") > base64(user) < 334 base64("Password:") > base64(pass) < 235 OK > MAIL FROM:<from@example.com> < 250 OK > RCPT TO:<to@example.com>      (per recipient) < 250 OK > DATA < 354 send body > <headers + CRLF + body + CRLF + "."> CRLF < 250 Queued <id> > QUIT < 221 bye  On any non-2xx/3xx reply (or socket error / timeout) the driver returns SendFailure with the reply text. Sends are atomic per call — the SmtpDriver doesn't pool connections in v1.

## Exports (7)

- `interface SmtpDialOptions (8 members)`
- `interface SmtpDialResult (3 members)`
- `interface SmtpDialFailure (3 members)`
- `type SmtpTransport`
- `buildSmtpDataBody(message: EmailMessage, ehloHost = "localhost"): string`
- `async PLACEHOLDER_SMTP_TRANSPORT()`
- `class SmtpDriver`
    - `constructor(private transport: SmtpTransport = PLACEHOLDER_SMTP_TRANSPORT)`
    - `async send({ ctx, message }: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure>`

## Depends on (3)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/ids.ts`](../../lib/ids.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../ports.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](./index.md)

