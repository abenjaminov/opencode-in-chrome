export function startupMessage(error, port) {
  if (error.code === 'EADDRINUSE') {
    return `Port ${port} is already in use. Disconnect chrome in the previous project's /mcps interface, then reconnect it in this project. Alternatively run npm run setup -- --port <free-port> and update the extension URL. See README.md#diagnose-a-port-conflict-on-windows.`;
  }
  if (error.code === 'EACCES')
    return `Permission denied listening on 127.0.0.1:${port}. Choose another port with npm run setup -- --port <free-port>.`;
  return `Could not start the Chrome bridge on 127.0.0.1:${port} (${error.code || 'unknown error'}). Run npm run doctor from the repository.`;
}

export async function listenBridge(server, port) {
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(new Error(startupMessage(error, port), { cause: error }));
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
}
