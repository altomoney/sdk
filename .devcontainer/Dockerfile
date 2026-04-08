FROM mcr.microsoft.com/vscode/devcontainers/base:debian

# Update package list
RUN apt update
# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

###### user running scripts ######
USER vscode
# Install FNM
RUN curl -o- https://fnm.vercel.app/install | ENV="$HOME/.bashrc" SHELL="$(which bash)" bash -
# Install Node.js
RUN /home/vscode/.local/share/fnm/fnm install 24
# Install pnpm and bun
RUN eval "$(/home/vscode/.local/share/fnm/fnm env --use-on-cd)" && npm install -g bun && npm install -g @withgraphite/graphite-cli@stable

# Switch back to root user
USER root
