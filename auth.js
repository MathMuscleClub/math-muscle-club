(function () {
    const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
    const PLACEHOLDER_VALUES = new Set([
        '',
        'YOUR_SUPABASE_URL',
        'YOUR_SUPABASE_ANON_KEY',
        'YOUR_SUPABASE_PUBLISHABLE_KEY'
    ]);

    let supabaseClient = null;
    let currentSession = null;
    let isConfigured = false;
    let isReady = false;
    let isRejectingSession = false;

    const elements = {};

    document.addEventListener('DOMContentLoaded', initAuth);

    async function initAuth() {
        cacheElements();
        if (!elements.panel) return;

        bindEvents();
        exposeAuthHelpers();

        const config = getConfig();
        isConfigured = hasSupabaseConfig(config);

        if (!isConfigured) {
            setConfiguredWaiting();
            return;
        }

        setControlsDisabled(true);
        setMessage('Supabaseに接続しています...', 'muted');

        try {
            const { createClient } = await import(SUPABASE_SDK_URL);
            supabaseClient = createClient(config.url, getSupabaseKey(config), {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });

            window.supabaseClient = supabaseClient;

            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;

            isReady = true;
            setControlsDisabled(false);
            updateSession(data.session);

            supabaseClient.auth.onAuthStateChange((_event, session) => {
                updateSession(session);
            });
        } catch (error) {
            console.error(error);
            isReady = false;
            setControlsDisabled(true);
            setAuthState('接続エラー', 'エラー', 'error');
            setMessage('Supabaseへの接続に失敗しました。', 'error');
        }
    }

    function cacheElements() {
        elements.panel = document.getElementById('auth-panel');
        elements.form = document.getElementById('auth-form');
        elements.email = document.getElementById('auth-email');
        elements.password = document.getElementById('auth-password');
        elements.googleButton = document.getElementById('auth-google-button');
        elements.signupButton = document.getElementById('auth-signup-button');
        elements.logoutButton = document.getElementById('auth-logout-button');
        elements.session = document.getElementById('auth-session');
        elements.sessionEmail = document.getElementById('auth-session-email');
        elements.stateText = document.getElementById('auth-state-text');
        elements.statusBadge = document.getElementById('auth-status-badge');
        elements.message = document.getElementById('auth-message');
    }

    function bindEvents() {
        elements.form?.addEventListener('submit', handleLogin);
        elements.googleButton?.addEventListener('click', handleGoogleSignIn);
        elements.signupButton?.addEventListener('click', handleSignup);
        elements.logoutButton?.addEventListener('click', handleLogout);
    }

    async function handleLogin(event) {
        event.preventDefault();
        if (!ensureReady()) return;

        const credentials = getCredentials();
        if (!credentials) return;

        await runAuthAction('ログインしています...', async () => {
            const { error } = await supabaseClient.auth.signInWithPassword(credentials);
            if (error) throw error;

            elements.password.value = '';
            setMessage('ログインしました。', 'success');
        });
    }

    async function handleSignup() {
        if (!ensureReady()) return;

        const credentials = getCredentials();
        if (!credentials) return;

        await runAuthAction('アカウントを作成しています...', async () => {
            const { data, error } = await supabaseClient.auth.signUp({
                ...credentials,
                options: {
                    emailRedirectTo: getRedirectUrl()
                }
            });
            if (error) throw error;

            elements.password.value = '';
            if (data.session) {
                setMessage('アカウントを作成してログインしました。', 'success');
            } else {
                setMessage('確認メールを送信しました。', 'success');
            }
        });
    }

    async function handleGoogleSignIn() {
        if (!ensureReady()) return;

        await runAuthAction('Googleへ移動しています...', async () => {
            const options = {
                redirectTo: getRedirectUrl()
            };
            const hostedDomain = getGoogleHostedDomain();
            if (hostedDomain) {
                options.queryParams = { hd: hostedDomain };
            }

            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options
            });
            if (error) throw error;
        });
    }

    async function handleLogout() {
        if (!ensureReady()) return;

        await runAuthAction('ログアウトしています...', async () => {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;

            setMessage('ログアウトしました。', 'success');
        });
    }

    async function runAuthAction(loadingMessage, action) {
        setControlsDisabled(true);
        setMessage(loadingMessage, 'muted');

        try {
            await action();
        } catch (error) {
            console.error(error);
            setMessage(toUserMessage(error), 'error');
        } finally {
            setControlsDisabled(false);
        }
    }

    function getCredentials() {
        const email = elements.email?.value.trim() || '';
        const password = elements.password?.value || '';

        if (!email || !password) {
            setMessage('メールアドレスとパスワードを入力してください。', 'error');
            return null;
        }

        if (!isEmailAllowed(email)) {
            setMessage('このメールアドレスではログインできません。', 'error');
            return null;
        }

        return { email, password };
    }

    function ensureReady() {
        if (!isConfigured) {
            setConfiguredWaiting();
            return false;
        }

        if (!isReady || !supabaseClient) {
            setMessage('Supabaseに接続中です。', 'muted');
            return false;
        }

        return true;
    }

    function updateSession(session) {
        currentSession = session || null;

        if (isRejectingSession && !currentSession) return;

        if (currentSession?.user) {
            const email = currentSession.user.email || 'ログイン済みユーザー';
            if (!isEmailAllowed(email)) {
                rejectDisallowedSession(email);
                return;
            }

            elements.panel.classList.add('is-authenticated');
            elements.form.hidden = true;
            elements.session.hidden = false;
            elements.sessionEmail.textContent = email;
            setAuthState(`${email} でログイン中です。`, 'ログイン中', 'success');
            return;
        }

        elements.panel.classList.remove('is-authenticated');
        elements.form.hidden = false;
        elements.session.hidden = true;
        elements.sessionEmail.textContent = '';
        setAuthState('メールアドレスでログインできます。', '未ログイン', 'muted');
    }

    function setConfiguredWaiting() {
        isReady = false;
        setControlsDisabled(true);
        setAuthState('Supabase設定待ちです。', '設定待ち', 'muted');
        setMessage('接続情報が未設定です。', 'muted');
    }

    function setControlsDisabled(disabled) {
        [
            elements.email,
            elements.password,
            elements.form?.querySelector('button[type="submit"]'),
            elements.googleButton,
            elements.signupButton,
            elements.logoutButton
        ].forEach(element => {
            if (element) element.disabled = disabled;
        });
    }

    function setAuthState(text, badgeText, kind) {
        if (elements.stateText) elements.stateText.textContent = text;
        if (!elements.statusBadge) return;

        elements.statusBadge.textContent = badgeText;
        elements.statusBadge.className = `auth-status-badge auth-status-${kind}`;
    }

    function setMessage(text, kind) {
        if (!elements.message) return;

        elements.message.textContent = text;
        elements.message.className = `auth-message auth-message-${kind}`;
    }

    function getConfig() {
        return window.SUPABASE_CONFIG || {};
    }

    function hasSupabaseConfig(config) {
        const url = String(config.url || '').trim();
        const key = getSupabaseKey(config);
        return !PLACEHOLDER_VALUES.has(url) && !PLACEHOLDER_VALUES.has(key);
    }

    function getSupabaseKey(config) {
        return String(config.anonKey || config.publishableKey || '').trim();
    }

    function getRedirectUrl() {
        const config = getConfig();
        if (config.redirectUrl) return config.redirectUrl;

        return `${window.location.origin}${window.location.pathname}`;
    }

    function getGoogleHostedDomain() {
        const config = getConfig();
        return normalizeDomainRule(config.googleHostedDomain || config.googleWorkspaceDomain || '');
    }

    function isEmailAllowed(email) {
        const rules = getAllowedEmailRules();

        if (rules.length === 0) return true;

        const lowerEmail = email.toLowerCase();
        const domain = lowerEmail.split('@')[1] || '';
        if (!domain) return false;

        return rules.some(rule => {
            const normalized = normalizeDomainRule(rule);
            if (rule.startsWith('@')) {
                return lowerEmail.endsWith(rule);
            }
            if (normalized.startsWith('.')) {
                return domain.endsWith(normalized);
            }
            return domain === normalized || domain.endsWith(`.${normalized}`);
        });
    }

    async function rejectDisallowedSession(email) {
        if (isRejectingSession) return;

        isRejectingSession = true;
        currentSession = null;
        elements.panel.classList.remove('is-authenticated');
        elements.form.hidden = false;
        elements.session.hidden = true;
        elements.sessionEmail.textContent = '';
        setControlsDisabled(true);
        setAuthState('許可ドメイン外です。', '拒否', 'error');
        setMessage(`${email} は許可されていないメールアドレスです。`, 'error');

        try {
            await supabaseClient?.auth.signOut();
        } catch (error) {
            console.error(error);
        } finally {
            isRejectingSession = false;
            setControlsDisabled(false);
        }
    }

    function getAllowedEmailRules() {
        const config = getConfig();
        return [
            ...(Array.isArray(config.allowedEmailDomains) ? config.allowedEmailDomains : []),
            ...(Array.isArray(config.allowedEmailSuffixes) ? config.allowedEmailSuffixes : [])
        ].map(rule => String(rule || '').trim().toLowerCase()).filter(Boolean);
    }

    function normalizeDomainRule(rule) {
        return String(rule || '').trim().toLowerCase().replace(/^@/, '');
    }

    function toUserMessage(error) {
        const message = String(error?.message || '');
        if (!message) return '処理に失敗しました。';
        if (message.includes('Invalid login credentials')) {
            return 'メールアドレスまたはパスワードが違います。';
        }
        if (message.includes('Email not confirmed')) {
            return 'メール確認がまだ完了していません。';
        }
        if (message.includes('Password should be at least')) {
            return 'パスワードが短すぎます。';
        }
        return message;
    }

    function exposeAuthHelpers() {
        window.SiteAuth = {
            getClient: () => supabaseClient,
            getSession: () => currentSession,
            requireSession: () => {
                if (currentSession) return currentSession;

                window.dispatchEvent(new CustomEvent('site-auth-required'));
                return null;
            }
        };
    }
})();
