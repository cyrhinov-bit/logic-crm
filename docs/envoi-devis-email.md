# Envoi des devis par e-mail — Guide

Chaque utilisateur envoie ses devis **depuis sa propre adresse**, **avec le PDF déjà joint**.

## Principe

- Chaque utilisateur configure **une seule fois** sa boîte (adresse + mot de passe) dans
  **Devis → onglet « Paramètres envoi devis par e-mail »**.
- Ensuite, **ses** devis partent de **son** adresse ; le client voit bien son e-mail comme expéditeur.
- Le mot de passe est **chiffré sur le poste** de l'utilisateur (jamais en base, jamais chez les autres).
- Tant qu'un utilisateur n'a pas configuré sa boîte, l'application l'invite à le faire :
  **aucun envoi ne part d'une autre adresse**.

> **Pourquoi pas Microsoft Graph / Outlook COM ?**
> La boîte `hinovgroup.com` est hébergée chez **LWS** en **IMAP/SMTP classique**, pas sur
> Microsoft 365. Graph et COM ne s'appliquent donc pas.

> **Pourquoi le mot de passe ?** Pour qu'un devis partît *au nom* d'une adresse, le serveur
> doit **authentifier cette boîte**. Mettre seulement un champ « De : » sans identifiants est
> refusé par le serveur (anti-usurpation). D'où la saisie unique du mot de passe par chacun.

---

## Procédure (par utilisateur, une fois)

1. Ouvrez **Devis** → onglet **« Paramètres envoi devis par e-mail »**.
2. L'application **pré-remplit automatiquement** :
   - *Votre adresse d'envoi* = l'e-mail de votre compte applicatif ;
   - *Serveur SMTP* = `mail.<votre-domaine>` ;
   - *Port* `465`, *Sécurité* `SSL/TLS`.
3. Saisissez **le mot de passe de votre boîte** (celui du webmail, pas celui de Windows).
4. **Enregistrer**, puis **Tester la connexion**.

✅ Ensuite, chaque devis que vous envoyez part de votre adresse.

> Ces réglages sont aussi accessibles, pour les personnes qui y ont droit, via
> **Paramètres → Envoi des devis par e-mail (SMTP)**.

---

## En cas de problème

| Message | Cause | Solution |
|---|---|---|
| **Aucune boîte d'envoi configurée** | L'utilisateur n'a pas réglé sa boîte | Refaire la procédure ci-dessus |
| **Identifiants refusés** | Mot de passe erroné | Vérifier le mot de passe de la boîte (webmail) |
| **Impossible de joindre le serveur** | Mauvais serveur/port | `mail.hinovgroup.com`, port 465 (SSL) ou 587 (STARTTLS) |
| **Adresse du destinataire invalide** | E-mail du client erroné | Corriger la fiche client |

---

## Notes techniques

- **Client** : `src/lib/mailUtils.ts` (`composeQuoteMail`) — envoi via la boîte de l'utilisateur ;
  en mode navigateur uniquement, repli `mailto` (PDF dans le presse-papiers).
- **SMTP** : `electron/services/mail/SmtpMailService.ts` (`nodemailer`), config dans
  `userData/smtp-mail.json`, mot de passe chiffré via `safeStorage`.
- **Canaux IPC** : `mail:smtpStatus`, `mail:smtpSetConfig`, `mail:smtpClear`, `mail:smtpVerify`,
  `mail:smtpSendTest`, `mail:smtpSend` (`electron/ipc/mail/`).
- **UI** : `src/components/MailSmtpSettings.tsx` (onglet Devis + section Paramètres).
