import * as api from "../api-client";

export interface AuthPanelCallbacks {
  onLogin: () => void;
  onLogout: () => void;
}

export function createAuthPanel(
  container: HTMLElement,
  callbacks: AuthPanelCallbacks
): { update: () => void } {
  const el = document.createElement("div");
  el.className = "panel-box";
  container.appendChild(el);

  function render() {
    if (api.isLoggedIn()) {
      el.innerHTML = `
        <div class="user-bar">
          <span>Logged in</span>
          <button class="secondary" id="dm-logout">Log out</button>
        </div>
      `;
      el.querySelector("#dm-logout")!.addEventListener("click", () => {
        api.logout();
        render();
        callbacks.onLogout();
      });
    } else {
      el.innerHTML = `
        <h3>Log in / Register</h3>
        <div class="error" id="dm-auth-error" style="display:none"></div>
        <input type="email" id="dm-email" placeholder="Email" />
        <input type="password" id="dm-password" placeholder="Password" />
        <div>
          <button class="primary" id="dm-login">Log in</button>
          <button class="secondary" id="dm-register">Register</button>
        </div>
      `;

      const emailEl = el.querySelector("#dm-email") as HTMLInputElement;
      const passEl = el.querySelector("#dm-password") as HTMLInputElement;
      const errEl = el.querySelector("#dm-auth-error") as HTMLElement;

      async function submit(action: "login" | "register") {
        errEl.style.display = "none";
        try {
          if (action === "login") {
            await api.login(emailEl.value, passEl.value);
          } else {
            await api.register(emailEl.value, passEl.value);
          }
          render();
          callbacks.onLogin();
        } catch (e) {
          errEl.textContent = (e as Error).message;
          errEl.style.display = "block";
        }
      }

      el.querySelector("#dm-login")!.addEventListener("click", () => submit("login"));
      el.querySelector("#dm-register")!.addEventListener("click", () => submit("register"));

      passEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit("login");
      });
    }
  }

  // Restore token from localStorage
  api.getToken();
  render();

  return { update: render };
}
