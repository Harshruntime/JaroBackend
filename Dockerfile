FROM mongo:6.0

# Create directory for keyfile
RUN mkdir -p /data/keyfile

# Generate keyfile using openssl
RUN openssl rand -base64 756 > /data/keyfile/mongo-keyfile \
    && chmod 400 /data/keyfile/mongo-keyfile \
    && chown mongodb:mongodb /data/keyfile/mongo-keyfile

# Expose MongoDB port
EXPOSE 27017

# Command to start MongoDB with replica set and keyfile
CMD ["mongod", "--replSet", "rs0", "--keyFile", "/data/keyfile/mongo-keyfile", "--bind_ip_all"]