"""Mail strategy: console (dev) or SMTP. Add new transports without touching callers (Open/Closed)."""
import os
import smtplib
from email.message import EmailMessage
from flask import current_app


class ConsoleMailer:
    def send(self, to, subject, body):
        path = os.path.join(os.path.dirname(current_app.config["DATABASE"]), "outbox.log")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"--- To: {to}\nSubject: {subject}\n{body}\n\n")
        print(f"[mail] to={to} subject={subject}")


class SmtpMailer:
    def send(self, to, subject, body):
        c = current_app.config
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = c["MAIL_FROM"], to, subject
        msg.set_content(body)
        with smtplib.SMTP(c["SMTP_HOST"], c["SMTP_PORT"], timeout=15) as s:
            s.starttls()
            if c["SMTP_USER"]:
                s.login(c["SMTP_USER"], c["SMTP_PASSWORD"])
            s.send_message(msg)


def get_mailer():
    return SmtpMailer() if current_app.config["MAIL_MODE"] == "smtp" and current_app.config["SMTP_HOST"] else ConsoleMailer()


def is_console():
    return isinstance(get_mailer(), ConsoleMailer)
