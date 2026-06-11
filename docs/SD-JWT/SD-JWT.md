# Issuing SD-JWT VC over IRMA (Yivi)

Yivi docs:  https://docs.yivi.app/sdjwtvc-issuance/

## Algemeen

Beide omgevingen hebben een app.json en gen.sh bestand.

App.json bestaat uit velden zoals 'legalName', 'credentials' en 'attributes'. Dit bestand komt overeen met de oude .xml bestanden zoals die beschreven staan in de oude Yivi schemes.

Voor nu implementeren we enkel de SD-JWT VC issuing voor het 'gemeente' schema.

gen.sh is door Yivi support opgezet om een gestandaardiseerd script te hebben waarmee je makkelijk alle relevante bestanden aan kan maken. Dit script genereert de volgende bestanden:

- .cfg
- .csr
- .der.key
- .pem.key

De CSR wordt gedeeld met Yivi support. Op basis van dit CSR worden certificaten aangemaakt en met ons gedeeld. De certificaten moeten vervolgens ingeladen worden binnen onze Yivi server.

### Omgevingen
- **irma-demo** is de acceptance / test environment.
- **pbdf** is de production environment.

## CSR & Certificaten
Een CSR kun je aanmaken door het .gen.sh bestand uit te voeren (aanbevolen). Voor acceptatie in folder 'irma-demo', voor productie in folder 'pbdf'.

Voorbeeld acceptatie:
```console
$ AP_JSON_FILE=app.json ISSUER_HOST=issue.yivi-brp-accp.csp-nijmegen.nl C=NL ST=Gelderland L=Nijmegen O="Gemeente Nijmegen" bash gen.sh
```

De .key bestanden worden opgeslagen in AWS Secrets Manager en lokaal verwijderd. Ook de CSR kan weg nadat de certificaten binnen zijn.

## Yivi Server

De overgang naar SD-JWT VC betekent ook wijzigingen in de Yivi server. Zonder correcte configuratie aan de server kant zal het `sdJwtBatchSize` veld in de issuance request genegeerd worden en worden er alleen Idemix credentials uitgegeven.

### Vereisten

1. **irmago versie ≥ 0.19** Oudere versies ondersteunen geen SD-JWT VC issuance.
2. **Issuer certificaat** Het SD-JWT VC issuer certificaat moet beschikbaar zijn in een `certs` directory, met een bestandsnaam die overeenkomt met de issuer identifier uit het scheme (bijv. `pbdf.gemeente.pem`).
3. **Private key** De bijbehorende private key moet in een aparte `privkeys` directory staan (bijv. `pbdf.gemeente.pem`).
4. **Server configuratie** De paden naar de `certs` en `privkeys` directories moeten geconfigureerd zijn op de IRMA server (via `config.json`, command line parameters, of environment variables).

### Meer informatie

De configuratie en deployment van de Yivi server zelf wordt beheerd in een aparte repository: https://github.com/GemeenteNijmegen/yivi-issue-server