#!/bin/bash
FQDN=$1

# make directories to work from
mkdir -p ssl/

# Create your very own Root Certificate Authority
openssl genrsa \
  -out ssl/ca.privkey.pem \
  2048

# Self-sign your Root Certificate Authority
# Since this is private, the details can be as bogus as you like
openssl req \
  -x509 \
  -new \
  -nodes \
  -key ssl/ca.privkey.pem \
  -days 365 \
  -out ssl/ca.pem \
  -subj "/C=US/ST=Utah/L=Provo/O=ACME Signing Authority Inc/CN=example.com"

# Create a Device Certificate for each domain,
# such as example.com, *.example.com, awesome.example.com
# NOTE: You MUST match CN to the domain name or ip address you want to use
openssl genrsa \
  -out ssl/key.pem \
  2048

# Create a request from your Device, which your Root CA will sign
openssl req -new \
  -key ssl/key.pem \
  -out ssl/csr.pem \
  -subj "/C=US/ST=Utah/L=Provo/O=ACME Tech Inc/CN=${FQDN}"

# Sign the request from Device with your Root CA
openssl x509 \
  -req -in ssl/csr.pem \
  -CA ssl/ca.pem \
  -CAkey ssl/ca.privkey.pem \
  -CAcreateserial \
  -out ssl/cert.pem \
  -days 365

rm ssl/ca.privkey.pem ssl/ca.srl ssl/csr.pem

openssl dhparam -out ssl/dhparam.pem 4096
