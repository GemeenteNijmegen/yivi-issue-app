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

De .key bestanden worden opgeslagen in Bitwarden en lokaal verwijderd. Ook de CSR kan weg nadat de certificaten binnen zijn.

## Yivi Server
De overgang naar SD-JWT VC betekent ook wijzigingen in de Yivi server.

TODO