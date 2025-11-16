let logoutFn: () => void = () => {};
let updateUserFn: (u: any) => void = () => {};

export function setAuthProxy(proxy: { logout: () => void; updateUser: (u: any) => void }) {
  logoutFn = proxy.logout;
  updateUserFn = proxy.updateUser;
}

export function logoutProxy() {
  try {
    logoutFn();
  } catch (e) {
    console.error('logoutProxy error', e);
  }
}

export function updateUserProxy(u: any) {
  try {
    updateUserFn(u);
  } catch (e) {
    console.error('updateUserProxy error', e);
  }
}
