# Frontend Routes Setup for Stripe Integration

## Add to client/src/App.js

### 1. Import Premium Pages

Add these imports at the top:

```javascript
import Premium from './pages/Premium';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
```

### 2. Add Routes

Add these routes in your Routes section:

```jsx
<Route path="/premium" element={<Premium />} />
<Route path="/payment/success" element={<PaymentSuccess />} />
<Route path="/payment/cancel" element={<PaymentCancel />} />
```

### Complete Example:

```javascript
// At the top with other imports:
import LoginPage from './pages/LoginPage';
import PasswordReset from './pages/PasswordReset';
import Premium from './pages/Premium'; // ADD THIS
import PaymentSuccess from './pages/PaymentSuccess'; // ADD THIS
import PaymentCancel from './pages/PaymentCancel'; // ADD THIS

// ... other code ...

// In your Routes:
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/password-reset" element={<PasswordReset />} />
  <Route path="/premium" element={<Premium />} /> {/* ADD THIS */}
  <Route path="/payment/success" element={<PaymentSuccess />} /> {/* ADD THIS */}
  <Route path="/payment/cancel" element={<PaymentCancel />} /> {/* ADD THIS */}
  <Route path="/auth/callback" element={<AuthCallback />} />
  {/* ... other routes ... */}
</Routes>
```

## Add Premium Link to Navigation (Optional)

In Header.js, you could add a "Premium" link in the navigation:

```jsx
<nav className="nav">
  <Link to="/" className="nav-link" onClick={handleHomeClick}>
    Home
  </Link>
  <button className="nav-link nav-button" onClick={handleGamesClick}>
    Games
  </button>
  <Link to="/premium" className="nav-link">
    Premium
  </Link> {/* ADD THIS */}
</nav>
```

## Test the Integration

1. Start your server: `cd server && npm start`
2. Start your client: `cd client && npm start`
3. Navigate to `http://localhost:3000/premium`
4. You should see the pricing page
5. Click "Subscribe Now" or "Get Lifetime Access"
6. You'll get an error because Stripe isn't configured yet
7. Follow STRIPE_INTEGRATION_GUIDE.md to configure Stripe

## Next Steps

1. Configure Stripe (see STRIPE_INTEGRATION_GUIDE.md)
2. Add environment variables (see STRIPE_SERVER_SETUP.md)
3. Run database migration (see STRIPE_DATABASE_MIGRATION.sql)
4. Test payment flow with Stripe test cards
