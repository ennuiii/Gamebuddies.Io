# Supabase OAuth Setup Guide

Your frontend code is already set up to handle OAuth logins. To make them work, you need to configure each provider in your Supabase project dashboard.

## 1. Google OAuth
1.  Go to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2.  Create a new project or select your existing one.
3.  Search for **"OAuth consent screen"** and configure it (External).
4.  Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**.
5.  Application type: **Web application**.
6.  **Authorized redirect URIs**:
    *   Add your Supabase callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
7.  Copy the **Client ID** and **Client Secret**.
8.  Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Google**.
9.  Paste the Client ID and Secret.
10. Enable the provider and click **Save**.

## 2. Discord OAuth
1.  Go to the **[Discord Developer Portal](https://discord.com/developers/applications)**.
2.  Click **New Application** and give it a name.
3.  Go to the **OAuth2** tab.
4.  Copy the **Client ID**.
5.  Click **Reset Secret** to get the **Client Secret**.
6.  Add Redirect: `https://<your-project-ref>.supabase.co/auth/v1/callback`
7.  Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Discord**.
8.  Paste the Client ID and Secret.
9.  Enable the provider and click **Save**.

## 3. Twitch OAuth
1.  Go to the **[Twitch Developer Console](https://dev.twitch.tv/console/apps)**.
2.  Register Your Application.
3.  Name: GameBuddies.
4.  OAuth Redirect URLs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5.  Category: Game Integration.
6.  Create.
7.  Copy **Client ID** and **Client Secret** (you may need to generate a new secret).
8.  Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Twitch**.
9.  Paste the Client ID and Secret.
10. Enable the provider and click **Save**.

## 4. Microsoft (Azure) OAuth
1.  Go to the **[Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)** (App registrations).
2.  Click **New registration**.
3.  Name: GameBuddies.
4.  Supported account types: **Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
5.  Redirect URI (Web): `https://<your-project-ref>.supabase.co/auth/v1/callback`
6.  Register.
7.  Copy the **Application (client) ID**.
8.  Go to **Certificates & secrets** -> **New client secret**. Copy the **Value** (not the ID).
9.  Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Azure (Microsoft)**.
10. Paste the Application (client) ID and Client Secret.
11. **Tenant URL**: usually `common` if you chose multitenant + personal.
12. Enable the provider and click **Save**.

## Important Note on Redirect URLs
In all cases, the Redirect URI/URL you provide to the service (Google, Discord, etc.) must be your **Supabase Project Callback URL**, NOT your localhost or website URL.

It looks like: `https://jbqm...supabase.co/auth/v1/callback`

You can find this URL in your Supabase Dashboard under **Authentication -> URL Configuration**.
