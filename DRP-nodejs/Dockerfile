FROM node:lts-alpine

# Define app directory
ENV APPDIR=/app

# Define script name
ARG runscript=server.js

# Full script path
ENV SCRIPTPATH=$APPDIR/$runscript

# Full webroot
ENV WEBROOT=$APPDIR/webroot

# Create app directory
WORKDIR ${APPDIR}

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY drp-endpoint/ drp-endpoint/
COPY drp-service/ drp-service/
COPY rsage-vdm/ rsage-vdm/
COPY webroot/ webroot/
COPY package.json .
COPY ${runscript} .

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
#COPY . .

EXPOSE 8080
CMD [ "node $SCRIPTPATH" ]
