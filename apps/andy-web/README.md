# Andy Web

Next.js front-end with server-side proxy to the private Andy Gateway.

## Local Dev
```
cd andy-web
npm install
npm run dev
```
Use `gcloud run services proxy andy-gateway --region europe-west3 --port 8081` and hit http://localhost:3000.

## Deploy
```
gcloud builds submit --tag europe-west3-docker.pkg.dev/coolbits-ai/andy/andy-web:$(date +%Y%m%d-%H%M%S)
gcloud run deploy andy-web --region europe-west3 --image europe-west3-docker.pkg.dev/coolbits-ai/andy/andy-web:TAG --service-account andy-web@coolbits-ai.iam.gserviceaccount.com --allow-unauthenticated --set-env-vars GATEWAY_URL=https://andy-gateway-...run.app
```
