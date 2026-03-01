import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background">
    {/* Nav */}
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to SignalStack
        </Link>
      </div>
    </nav>

    {/* Content */}
    <main className="container max-w-3xl py-16 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective date: 1 March 2026</p>
      </div>

      <section className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          This Privacy Policy explains how Pot Strategy (Pty) Ltd, trading as Pot Labs
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), collects, uses, stores and
          protects your personal information when you use SignalStack
          (&quot;the Platform&quot;). We are committed to complying with the Protection of
          Personal Information Act, 2013 (POPIA) and all applicable South African data
          protection legislation.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">1. Information We Collect</h2>
        <p><strong className="text-foreground">Account Information.</strong> When you create an account we collect your name, email address, company name, and job title.</p>
        <p><strong className="text-foreground">Usage Data.</strong> We collect information about how you interact with the Platform, including pages visited, features used, browser type, device information, and IP address.</p>
        <p><strong className="text-foreground">Uploaded Data.</strong> You may upload sell-out data, campaign data and other business datasets. This data remains your property and is processed solely to provide the Platform&apos;s analytics services to you.</p>
        <p><strong className="text-foreground">Payment Information.</strong> Payments are processed by Stripe. We do not store credit card numbers or full payment details on our servers. We retain transaction identifiers and subscription status.</p>

        <h2 className="text-lg font-semibold text-foreground pt-4">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To provide, maintain and improve the Platform and its features.</li>
          <li>To authenticate your identity and manage your account.</li>
          <li>To process your uploaded data and generate analytics, insights and reports.</li>
          <li>To process payments and manage your subscription.</li>
          <li>To communicate with you about your account, service updates and support requests.</li>
          <li>To detect and prevent fraud, abuse or security incidents.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground pt-4">3. Data Storage &amp; Security</h2>
        <p>
          Your data is stored on infrastructure provided by Supabase (PostgreSQL database
          with row-level security). Data is encrypted in transit (TLS) and at rest. We
          implement industry-standard security measures including authentication, role-based
          access control and audit logging. Only authorised personnel have access to
          production systems.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">4. Third-Party Services</h2>
        <p>We use the following third-party services to operate the Platform:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">Supabase</strong> — database, authentication and file storage.</li>
          <li><strong className="text-foreground">Stripe</strong> — payment processing and subscription management.</li>
          <li><strong className="text-foreground">OpenRouter</strong> — AI model routing for generating analytics insights. Your uploaded data may be sent to AI model providers (such as DeepSeek, Google Gemini, or Anthropic Claude) to generate insights. Data is sent via encrypted API calls and is not used to train third-party models.</li>
          <li><strong className="text-foreground">Lovable</strong> — application hosting and deployment.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground pt-4">5. Cookies</h2>
        <p>We use cookies and similar technologies for the following purposes:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">Strictly Necessary Cookies.</strong> Required for authentication, session management and security. These cannot be disabled.</li>
          <li><strong className="text-foreground">Functional Cookies.</strong> Remember your preferences such as theme settings and dashboard layout.</li>
          <li><strong className="text-foreground">Analytics Cookies.</strong> Help us understand how the Platform is used so we can improve it. These are only set with your consent.</li>
        </ul>
        <p>You can manage your cookie preferences at any time via the cookie consent banner or by clearing your browser cookies.</p>

        <h2 className="text-lg font-semibold text-foreground pt-4">6. Data Retention</h2>
        <p>
          We retain your account information for as long as your account is active. Uploaded
          datasets are retained for the duration of your subscription plus 30 days after
          cancellation, after which they are permanently deleted. You may request deletion of
          your data at any time by contacting us.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">7. Your Rights Under POPIA</h2>
        <p>As a data subject under POPIA, you have the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Access your personal information held by us.</li>
          <li>Request correction of inaccurate personal information.</li>
          <li>Request deletion of your personal information.</li>
          <li>Object to the processing of your personal information.</li>
          <li>Withdraw consent for optional data processing.</li>
          <li>Lodge a complaint with the Information Regulator of South Africa.</li>
        </ul>
        <p>To exercise any of these rights, please contact us at the details below.</p>

        <h2 className="text-lg font-semibold text-foreground pt-4">8. Data Sharing</h2>
        <p>
          We do not sell, rent or trade your personal information. We may share data with
          third-party service providers listed in Section 4 solely to operate the Platform.
          We may disclose information if required by law, court order or governmental
          authority.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">9. Children&apos;s Privacy</h2>
        <p>
          The Platform is not intended for use by individuals under the age of 18. We do not
          knowingly collect personal information from children.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material
          changes by email or by posting a notice on the Platform. Your continued use of the
          Platform after changes constitutes acceptance of the updated policy.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">11. Contact Us</h2>
        <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:</p>
        <ul className="list-none space-y-1">
          <li><strong className="text-foreground">Company:</strong> Pot Strategy (Pty) Ltd, trading as Pot Labs</li>
          <li><strong className="text-foreground">Email:</strong> <a href="mailto:hello@potstrategy.com" className="text-primary hover:underline">hello@potstrategy.com</a></li>
          <li><strong className="text-foreground">Website:</strong> <a href="https://signalstack.africa" className="text-primary hover:underline">signalstack.africa</a></li>
        </ul>
      </section>
    </main>

    {/* Footer */}
    <footer className="border-t border-border/40 py-8">
      <div className="container flex items-center justify-between text-sm text-muted-foreground">
        <span>&copy; 2026 SignalStack by Pot Labs.</span>
        <div className="flex gap-6">
          <span className="text-foreground font-medium">Privacy</span>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <a href="mailto:hello@potstrategy.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  </div>
);

export default PrivacyPolicy;
