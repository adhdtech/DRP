FROM alpine:latest

RUN apk add --update npm

# Define app directory
ENV APPDIR=/app
ENV NODE_ENV=production

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY cucm-sql-async cucm-sql-async
COPY drp-mesh drp-mesh
COPY drp-swaggerui drp-swaggerui
COPY drp-service-cache drp-service-cache
COPY drp-service-logger drp-service-logger
COPY drp-service-docmgr drp-service-docmgr
COPY drp-service-rsage drp-service-rsage
COPY drp-service-bluecat drp-service-bluecat
COPY drp-service-netscaler drp-service-netscaler
COPY drp-service-ldap drp-service-ldap
COPY drp-service-test drp-service-test
COPY webroot webroot
COPY jsondocs jsondocs
COPY package.json .
COPY server.js .
COPY drpRegistry.js .
COPY drpBroker.js .
COPY drpConsumer.js .
COPY drpLogger.js .
COPY drpProvider-Cache.js .
COPY drpProvider-DocMgr.js .
COPY drpProvider-Hive.js .
COPY drpProvider-Test.js .
COPY drpProvider-Test-NoListener.js .
COPY drpProvider-BlueCat.js .
COPY drpProvider-NetScaler.js .
COPY drpProvider-Test-Authenticator.js .
COPY drpProvider-LDAP-Authenticator.js .

RUN npm install --production
# If you are building your code for production
# RUN npm ci --only=production

LABEL cisco.info.name="drp-nodejs-small" \
      cisco.info.description="DRP Node.js Server" \
      cisco.info.version="latest" \
      cisco.info.author-link="https://adhdtech.com" \
      cisco.info.author-name="Pete Brown" \
      cisco.type=docker \
      cisco.cpuarch=x86_64 \
      cisco.resources.profile=custom \
      cisco.resources.cpu=400 \
      cisco.resources.memory=128 \
      cisco.resources.disk=128 \
      cisco.resources.network.0.interface-name=eth0 \
      cisco.resources.network.0.ports.tcp=[8080]

EXPOSE 8080
CMD [ "node", "server.js" ]
