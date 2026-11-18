# A reference sidecar image (see server.mjs). Pin the base image by digest in your own build, and pin the image you
# publish by digest in the manifest: a tag can move, a digest cannot.
FROM node:26-bookworm-slim
WORKDIR /app
COPY server.mjs ./
# Not root: the compose fragment runs it as 65532 on a read-only file system without capabilities.
USER 65532:65532
EXPOSE 8080
CMD ["node", "server.mjs"]
