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
    let redirectNotice = null;

    const elements = {};

    document.addEventListener('DOMContentLoaded', initAuth);

    async function initAuth() {
        cacheElements();
        if (!elements.panel) return;

        bindEvents();
        exposeAuthHelpers();

        redirectNotice = readAuthRedirectNotice();
        if (redirectNotice) {
            switchToAuthTab();
            showAuthNotice(redirectNotice.title, redirectNotice.body, redirectNotice.kind);
            clearAuthParamsFromUrl();
        }

        const config = getConfig();
        isConfigured = hasSupabaseConfig(config);
        renderDomainNote();

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
        elements.profile = document.getElementById('auth-profile');
        elements.profileStatus = document.getElementById('auth-profile-status');
        elements.usernameForm = document.getElementById('auth-username-form');
        elements.username = document.getElementById('auth-username');
        elements.usernameSaveButton = document.getElementById('auth-username-save-button');
        elements.profileMessage = document.getElementById('auth-profile-message');
        elements.stateText = document.getElementById('auth-state-text');
        elements.statusBadge = document.getElementById('auth-status-badge');
        elements.notice = document.getElementById('auth-notice');
        elements.noticeTitle = document.getElementById('auth-notice-title');
        elements.noticeBody = document.getElementById('auth-notice-body');
        elements.domainNote = document.getElementById('auth-domain-note');
        elements.message = document.getElementById('auth-message');
    }

    function bindEvents() {
        elements.form?.addEventListener('submit', handleLogin);
        elements.googleButton?.addEventListener('click', handleGoogleSignIn);
        elements.signupButton?.addEventListener('click', handleSignup);
        elements.logoutButton?.addEventListener('click', handleLogout);
        elements.usernameForm?.addEventListener('submit', handleUsernameSave);
    }

    async function handleLogin(event) {
        event.preventDefault();
        if (!ensureReady()) return;

        hideAuthNotice();
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

        hideAuthNotice();
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

        hideAuthNotice();
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

    async function handleUsernameSave(event) {
        event.preventDefault();
        if (!ensureReady()) return;

        const username = normalizeUsername(elements.username?.value || '');
        if (!username) {
            setProfileMessage('ユーザー名を入力してください。', 'error');
            return;
        }

        await runAuthAction('ユーザー名を保存しています...', async () => {
            const currentMetadata = currentSession?.user?.user_metadata || {};
            const { data, error } = await supabaseClient.auth.updateUser({
                data: {
                    ...currentMetadata,
                    username
                }
            });
            if (error) throw error;

            if (currentSession && data.user) {
                currentSession = {
                    ...currentSession,
                    user: data.user
                };
            }

            renderProfile(currentSession);
            notifySessionChanged();
            setProfileMessage('ユーザー名を保存しました。', 'success');
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
            renderProfile(currentSession);
            const username = getSessionUsername(currentSession);
            elements.sessionEmail.textContent = username ? `${username} (${email})` : email;
            setAuthState(
                username ? `${username} としてログイン中です。` : 'ユーザー名を登録してください。',
                'ログイン中',
                username ? 'success' : 'muted'
            );
            notifySessionChanged();
            return;
        }

        elements.panel.classList.remove('is-authenticated');
        elements.form.hidden = false;
        elements.session.hidden = true;
        if (elements.profile) elements.profile.hidden = true;
        elements.sessionEmail.textContent = '';
        setAuthState('メールアドレスでログインできます。', '未ログイン', 'muted');
        notifySessionChanged();
    }

    function renderProfile(session) {
        if (!elements.profile) return;

        const username = getSessionUsername(session);
        const suggested = username || getSuggestedUsername(session);
        elements.profile.hidden = !session?.user;

        if (elements.username) {
            elements.username.value = suggested;
        }

        if (elements.profileStatus) {
            elements.profileStatus.textContent = username
                ? `${username} として提出されます。`
                : '初回は提出者名になるユーザー名を保存してください。';
        }

        if (elements.profileMessage && !username) {
            elements.profileMessage.textContent = 'ユーザー名を保存するとTeXを提出できます。';
            elements.profileMessage.className = 'auth-message auth-message-muted';
        }
    }

    function notifySessionChanged() {
        window.dispatchEvent(new CustomEvent('site-auth-changed', {
            detail: { session: currentSession }
        }));
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
            elements.logoutButton,
            elements.username,
            elements.usernameSaveButton
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

    function setProfileMessage(text, kind) {
        if (!elements.profileMessage) return;

        elements.profileMessage.textContent = text;
        elements.profileMessage.className = `auth-message auth-message-${kind}`;
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
        showAuthNotice(
            'ログインできませんでした',
            `${email} は許可されているドメインではありません。g.ecc.u-tokyo.ac.jp のGoogleアカウントでログインしてください。`,
            'error'
        );

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

    function normalizeUsername(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
    }

    function getSessionUsername(session) {
        return normalizeUsername(session?.user?.user_metadata?.username || '');
    }

    function getSuggestedUsername(session) {
        const metadata = session?.user?.user_metadata || {};
        const fromMetadata = normalizeUsername(metadata.full_name || metadata.name || '');
        if (fromMetadata) return fromMetadata;

        const email = session?.user?.email || '';
        return normalizeUsername(email.split('@')[0] || '');
    }

    function renderDomainNote() {
        if (!elements.domainNote) return;

        const rules = getAllowedEmailRules();
        if (rules.length === 0) {
            elements.domainNote.textContent = '';
            elements.domainNote.hidden = true;
            return;
        }

        const domainText = rules
            .map(rule => normalizeDomainRule(rule))
            .filter(Boolean)
            .join(' / ');
        elements.domainNote.textContent = `${domainText} のGoogleアカウントでログインできます。`;
        elements.domainNote.hidden = false;
    }

    function showAuthNotice(title, body, kind = 'error') {
        if (!elements.notice) return;

        elements.notice.hidden = false;
        elements.notice.className = `auth-notice auth-notice-${kind}`;
        if (elements.noticeTitle) elements.noticeTitle.textContent = title || '';
        if (elements.noticeBody) elements.noticeBody.textContent = body || '';
    }

    function hideAuthNotice() {
        if (!elements.notice) return;

        elements.notice.hidden = true;
        if (elements.noticeTitle) elements.noticeTitle.textContent = '';
        if (elements.noticeBody) elements.noticeBody.textContent = '';
    }

    function readAuthRedirectNotice() {
        const params = new URLSearchParams(window.location.search);
        const hashText = window.location.hash.replace(/^#/, '');
        const hashParams = new URLSearchParams(hashText);

        const errorCode = params.get('error_code') || hashParams.get('error_code') || '';
        const error = params.get('error') || hashParams.get('error') || '';
        const description = params.get('error_description') || hashParams.get('error_description') || '';
        if (!errorCode && !error && !description) return null;

        return {
            kind: 'error',
            title: 'ログインできませんでした',
            body: toAuthRedirectMessage(errorCode, description || error)
        };
    }

    function toAuthRedirectMessage(errorCode, description) {
        const decodedDescription = decodeAuthText(description);

        if (errorCode === 'signup_disabled') {
            return 'Supabaseで新規登録がOFFになっています。初回ログインを通すときは、Supabaseの新規登録を一時的にONにしてください。';
        }

        if (decodedDescription.includes('このメールアドレスでは登録できません')) {
            return 'このGoogleアカウントは許可されていません。g.ecc.u-tokyo.ac.jp のGoogleアカウントでログインしてください。';
        }

        if (decodedDescription.includes('missing OAuth secret')) {
            return 'SupabaseのGoogle ProviderにClient Secretが入っていません。Supabase側のGoogle設定を保存してください。';
        }

        if (errorCode === 'access_denied') {
            return decodedDescription || 'Googleログインが拒否されました。許可されたGoogleアカウントか確認してください。';
        }

        return decodedDescription || 'ログイン処理が完了しませんでした。もう一度試してください。';
    }

    function decodeAuthText(value) {
        try {
            return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
        } catch (_error) {
            return String(value || '').replace(/\+/g, ' ');
        }
    }

    function clearAuthParamsFromUrl() {
        if (!window.history || !window.history.replaceState) return;

        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    function switchToAuthTab() {
        if (typeof window.switchTab === 'function') {
            window.switchTab('auth');
            return;
        }

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === 'auth');
        });
        document.querySelectorAll('.tab-button').forEach(button => {
            const target = button.getAttribute('onclick') || '';
            button.classList.toggle('active', target.includes('auth'));
        });
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
            getUsername: () => getSessionUsername(currentSession),
            hasUsername: () => Boolean(getSessionUsername(currentSession)),
            requireSession: () => {
                if (currentSession) return currentSession;

                window.dispatchEvent(new CustomEvent('site-auth-required'));
                return null;
            },
            requireUsername: () => {
                const username = getSessionUsername(currentSession);
                if (username) return username;

                window.dispatchEvent(new CustomEvent('site-username-required'));
                return null;
            }
        };
    }
})();
