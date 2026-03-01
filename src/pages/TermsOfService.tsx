import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => (
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
        <h1 className="font-display text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective date: 1 March 2026</p>
      </div>

      <section className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of
          SignalStack (&quot;the Platform&quot;), operated by Pot Strategy (Pty) Ltd,
          trading as Pot Labs (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By
          creating an account or using the Platform, you agree to be bound by these Terms.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">1. Definitions</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">&quot;Platform&quot;</strong> means the SignalStack web application available at signalstack.africa and any associated services.</li>
          <li><strong className="text-foreground">&quot;User&quot;</strong> means any individual or entity that creates an account on the Platform.</li>
          <li><strong className="text-foreground">&quot;Client Data&quot;</strong> means any data, files or content uploaded to the Platform by a User.</li>
          <li><strong className="text-foreground">&quot;Subscription&quot;</strong> means a paid plan granting access to the Platform&apos;s features.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground pt-4">2. Account Registration</h2>
        <p>
          You must provide accurate and complete information when creating an account. You
          are responsible for maintaining the confidentiality of your login credentials and
          for all activities that occur under your account. You must notify us immediately of
          any unauthorised use of your account.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">3. Subscriptions &amp; Payments</h2>
        <p>
          Access to the Platform&apos;s features requires an active Subscription. Subscription
          fees are billed in advance on a monthly or annual basis through Stripe. All fees
          are quoted in US Dollars (USD) unless otherwise stated. Fees are non-refundable
          except where required by law.
        </p>
        <p>
          We reserve the right to change Subscription fees upon 30 days&apos; written notice.
          If you do not agree to the new fees, you may cancel your Subscription before the
          next billing cycle.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">4. Data Ownership</h2>
        <p>
          <strong className="text-foreground">You retain full ownership of your Client Data.</strong> By
          uploading data to the Platform, you grant us a limited, non-exclusive licence to
          process, store and analyse your data solely for the purpose of providing the
          Platform&apos;s services to you. We will not sell, share or use your Client Data
          for any purpose other than delivering our services.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use the Platform for any unlawful purpose or in violation of any applicable law.</li>
          <li>Upload data that infringes on third-party intellectual property rights.</li>
          <li>Attempt to gain unauthorised access to the Platform, other user accounts or our systems.</li>
          <li>Reverse engineer, decompile or disassemble any part of the Platform.</li>
          <li>Use automated tools to scrape, crawl or extract data from the Platform.</li>
          <li>Interfere with or disrupt the Platform&apos;s operation or infrastructure.</li>
          <li>Share your account credentials with unauthorised individuals.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground pt-4">6. Intellectual Property</h2>
        <p>
          The Platform, including its design, code, features, documentation and branding, is
          the intellectual property of Pot Strategy (Pty) Ltd. You are granted a limited,
          non-transferable, revocable licence to use the Platform for its intended purpose
          during your active Subscription. This licence does not transfer any ownership
          rights to you.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">7. AI-Generated Insights</h2>
        <p>
          The Platform uses artificial intelligence to generate analytics insights,
          recommendations and reports. While we strive for accuracy, AI-generated content is
          provided for informational purposes only and should not be treated as professional
          financial, legal or strategic advice. You are responsible for independently
          verifying any AI-generated output before making business decisions.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">8. Service Availability</h2>
        <p>
          We aim to maintain high availability of the Platform but do not guarantee
          uninterrupted or error-free service. We may perform scheduled maintenance with
          reasonable notice. We are not liable for any downtime, data loss or service
          interruptions caused by factors outside our reasonable control.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by South African law, Pot Strategy (Pty) Ltd shall
          not be liable for any indirect, incidental, special, consequential or punitive
          damages, including but not limited to loss of profits, data, business opportunities
          or goodwill, arising from your use of the Platform. Our total aggregate liability
          shall not exceed the amount you have paid to us in the twelve (12) months preceding
          the claim.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Pot Strategy (Pty) Ltd, its directors,
          employees and affiliates from any claims, damages, losses, liabilities and expenses
          (including legal fees) arising from your use of the Platform, your violation of
          these Terms, or your infringement of any third-party rights.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">11. Termination</h2>
        <p>
          You may cancel your Subscription at any time through your account settings or by
          contacting us. We may suspend or terminate your access if you violate these Terms,
          with or without notice depending on the severity of the violation. Upon termination,
          your right to use the Platform ceases immediately. We will retain your Client Data
          for 30 days after termination, after which it will be permanently deleted.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">12. Governing Law &amp; Jurisdiction</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the
          Republic of South Africa. Any disputes arising from or in connection with these
          Terms shall be subject to the exclusive jurisdiction of the courts of the Republic
          of South Africa.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">13. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. We will notify you of material changes
          by email or by posting a notice on the Platform at least 14 days before the changes
          take effect. Your continued use of the Platform after the changes constitutes
          acceptance of the updated Terms.
        </p>

        <h2 className="text-lg font-semibold text-foreground pt-4">14. Contact Us</h2>
        <p>If you have questions about these Terms, please contact us:</p>
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
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <span className="text-foreground font-medium">Terms</span>
          <a href="mailto:hello@potstrategy.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  </div>
);

export default TermsOfService;
