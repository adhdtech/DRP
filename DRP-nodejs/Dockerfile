FROM node:lts-alpine

# Define app directory
ENV APPDIR=/app

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY cucm-sql-async/ cucm-sql-async/
COPY drp-mesh/ drp-mesh/
COPY drp-service-cache/ drp-service-cache/
COPY drp-service-docmgr/ drp-service-docmgr/
COPY drp-service-rsage/ drp-service-rsage/
COPY webroot/ webroot/
COPY jsondocs/ jsondocs/
COPY package.json .
COPY server.js .
COPY drpRegistry.js .
COPY drpBroker.js .
COPY drpConsumer.js .
COPY drpProvider-JSONDocMgr.js .
COPY drpProvider-Hive.js .
COPY drpProvider-Test.js .
COPY drpProvider-Test-NoListener.js .

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
#COPY . .

EXPOSE 8080
CMD [ "node", "server.js" ]
