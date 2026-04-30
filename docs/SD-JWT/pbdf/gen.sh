# Example usage:
# $ AP_JSON_FILE=app.json ISSUER_HOST=issue.yivi-brp-prod.csp-nijmegen.nl C=NL ST=Gelderland L=Nijmegen O="Gemeente Nijmegen" bash gen.sh

# remove whitespace and escape quotes for json
escaped_json=$(cat $AP_JSON_FILE | jq -c | jq -R)

# create cfg file for the certificate signing request
echo "
[ req ]
default_md         = sha256
distinguished_name = req_distinguished_name
prompt             = no
req_extensions     = v3_req
x509_extensions    = v3_ext

[ req_distinguished_name ]
C  = $C
ST = $ST
L  = $L
O  = $O
CN = $ISSUER_HOST

[ v3_req ]
subjectAltName   = @alt_names
extendedKeyUsage = clientAuth
keyUsage         = digitalSignature, keyEncipherment
basicConstraints = critical, CA:FALSE
2.1.123.1        = ASN1:UTF8String:$escaped_json

[ alt_names ]
DNS.0 = $ISSUER_HOST
URI.1 = https://$ISSUER_HOST

[ v3_ext ]
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always,issuer
" > "$ISSUER_HOST.cfg"


# generate private key
openssl ecparam -name prime256v1 -genkey -noout -outform DER -out $ISSUER_HOST.der.key

# convert private key to pem format
openssl ec -inform DER -in $ISSUER_HOST.der.key -outform PEM -out $ISSUER_HOST.pem.key

# convert key to PKCS#8 format
openssl pkcs8 -topk8 -inform DER -outform DER -nocrypt -in $ISSUER_HOST.der.key -out pkcs8.key

# create certificate signing request
openssl req -config $ISSUER_HOST.cfg -new -key pkcs8.key -out $ISSUER_HOST.csr