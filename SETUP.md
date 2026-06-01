# Setup — CRM Assurance MRI

## 1. Variables d'environnement (Railway)

Copier `.env.example` → configurer dans Railway :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | URL PostgreSQL Railway |
| `NEXTAUTH_URL` | URL publique de l'app (ex: `https://crm.matera.eu`) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Depuis Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Depuis Google Cloud Console |
| `OMNI_API_URL` | URL de l'instance Omni |
| `OMNI_API_KEY` | Clé API Omni |
| `OMNI_MODEL_ID` | ID du modèle Omni avec les données copros |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `DUOMO_WEBHOOK_SECRET` | Secret partagé avec l'équipe tech Duomo |
| `ADMIN_EMAILS` | `claire.jaquemet@matera.eu` (comma-separated) |

## 2. Google OAuth

1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Créer un projet ou utiliser l'existant Matera
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Type : Web application
5. Authorized redirect URIs : `https://[ton-domaine]/api/auth/callback/google`
6. Copier Client ID et Client Secret dans Railway

## 3. Base de données

Sur Railway :
```bash
# Créer le schéma
npx prisma migrate deploy

# Seeder les tâches prédéfinies
npm run db:seed
```

## 4. Cron job Railway

Créer un service Railway séparé (Worker) qui appelle le sync Omni chaque nuit :

```bash
# Command du cron worker
node -e "
const https = require('https');
const url = new URL(process.env.APP_URL + '/api/sync/omni');
setInterval(() => {
  const req = https.request({
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET, 'content-length': 0 }
  }, res => console.log(new Date().toISOString(), 'sync status:', res.statusCode));
  req.end();
}, 24 * 60 * 60 * 1000);
"
```

Variables additionnelles pour le cron : `APP_URL`, `CRON_SECRET`.

## 5. Webhook Duomo

Donner à l'équipe tech l'endpoint : `POST https://[ton-domaine]/api/webhooks/duomo`

Format attendu :
```json
{
  "building_id": "duomo-id-123",
  "event": "insurance_contract_updated",
  "data": {
    "assureur": "SMABTP",
    "courtier": "Matera",
    "prime": 4200,
    "date_echeance": "2026-12-31",
    "contact_cs_email": "president@copro.fr",
    "contact_cs_nom": "Jean Dupont"
  }
}
```

Signature HMAC-SHA256 dans le header `x-duomo-signature: sha256=[hash]`.

## 6. Adapter le client Omni

Éditer `src/lib/omni.ts` pour adapter le mapping des champs selon la réponse réelle de l'API Omni. La fonction `fetchCoprosFromOmni` retourne les copros avec leurs données d'assurance.

## 7. Première synchronisation

Une fois en production, déclencher manuellement la première sync :
```bash
curl -X POST https://[ton-domaine]/api/sync/omni \
  -H "x-cron-secret: [CRON_SECRET]"
```
