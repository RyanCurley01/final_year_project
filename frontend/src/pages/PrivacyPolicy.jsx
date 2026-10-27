import { Link } from 'react-router-dom';

const sectionClass = 'space-y-3';
const paragraphClass = 'leading-7 text-slate-300';
const listClass = 'list-disc space-y-2 pl-6 leading-7 text-slate-300';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[#0b1020] px-5 py-10 text-slate-100 sm:px-8">
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-4 border-b border-white/15 pb-6">
          <Link to="/login" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back to the app
          </Link>
          <h1 className="text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
          <p className={paragraphClass}>Last updated: October 27, 2026</p>
          <p className={paragraphClass}>
            This policy explains how Music Recommendation Store (“the app”) handles personal data when you use the website and its features. The data controller is Ritrix_Games, which is responsible for deciding how and why personal data is processed.
          </p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Information the app handles</h2>
          <ul className={listClass}>
            <li>
              <strong className="text-white">Account information:</strong> name, email address, optional phone number, account identifiers, and sign-in information managed through Firebase Authentication, including Google sign-in and email/password sign-in.
            </li>
            <li>
              <strong className="text-white">Orders and payments:</strong> items purchased, order details, amounts, payment status, timestamps, and PayPal order identifiers. PayPal processes payment details. The app is not intended to store your full card number or PayPal password.
            </li>
            <li>
              <strong className="text-white">Music activity:</strong> playback events may include the track, playback duration, completion information, device category, and a session identifier associated with your account. This information supports playback history, play counts, and recommendations.
            </li>
            <li>
              <strong className="text-white">Search and recommendation inputs:</strong> search terms and audio-feature values may be processed by the app’s services and, where needed to provide a feature, relevant third-party services.
            </li>
            <li>
              <strong className="text-white">Audio, MIDI, and images:</strong> when you choose to use microphone analysis, audio is analyzed in your browser and derived audio-feature values may be sent to the recommendation service; the microphone recording itself is not sent by this feature. MIDI messages are processed in your browser to calculate recommendation targets, which may be sent to the recommendation service. Images used in Spectrogram Creator are processed in your browser. Saved presets or images may remain in browser storage.
            </li>
            <li>
              <strong className="text-white">Technical information:</strong> hosting and infrastructure providers may process connection details, such as IP address, browser information, and service logs, to deliver, maintain, and protect the app.
            </li>
          </ul>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Purposes and legal bases</h2>
          <p className={paragraphClass}>
            The controller processes personal data only where a legal basis applies. Account, music, and order data are processed as necessary to provide features you request and perform the contract with you. Payment and transaction records may be processed to meet legal accounting or other legal obligations. Security, service reliability, preventing misuse, and understanding aggregate use of music features may be pursued on the basis of the controller’s legitimate interests, balanced against your rights and expectations. Microphone and MIDI features are used when you activate them and grant the relevant browser or device permission; you can withdraw that permission in your browser or device settings. Where consent is the legal basis for a particular activity, you may withdraw it at any time, without affecting processing that took place before withdrawal.
          </p>
          <p className={paragraphClass}>
            The controller uses the information for the purposes described above, including maintaining accounts, providing music and recommendation features, processing orders, recording purchase history, responding to support or privacy requests, and maintaining app security and operation. Playback information may be used for play counts and music discovery features.
          </p>
          <p className={paragraphClass}>
            Recommendation features use audio-feature values and, where applicable, music activity to tailor song suggestions. This involves automated processing to personalize recommendations and is not intended to make decisions producing legal or similarly significant effects about you.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Browser storage</h2>
          <p className={paragraphClass}>
            The app uses browser local storage and session storage for sign-in state, cart and app state, preferences such as MIDI mappings, saved Spectrogram Creator content, and session identifiers. During an active email/password session, the app keeps the entered password in memory to authenticate requests to legacy backend services; it does not write raw passwords to app-managed browser storage. Older saved sessions are cleaned when the app loads. These technologies support app functionality. Firebase, PayPal, and hosting providers may also use cookies or similar technologies when their services are used; consult their privacy and cookie information for details of their own technologies.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Service providers and sharing</h2>
          <p className={paragraphClass}>
            The app uses third-party services to operate. Depending on the feature you use, information may be processed by Google Firebase for authentication, PayPal for checkout, Vercel for frontend hosting, Railway for backend and database hosting, AWS for file storage, Apple’s iTunes services for music search and previews, and LoremFlickr for image search. These providers process information under their own terms and may act as processors or independent controllers depending on the service. The app does not sell personal information for advertising.
          </p>
          <p className={paragraphClass}>
            Information may also be disclosed when necessary to protect the app or its users, respond to a lawful request, or meet a legal obligation. These providers may process information outside the European Economic Area. Where required, transfers rely on an adequacy decision or appropriate safeguards under data-protection law. You may contact the controller for information about safeguards relevant to a particular transfer.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Retention and your choices</h2>
          <p className={paragraphClass}>
            Personal data is kept only for as long as needed for the purpose for which it was collected. Account data is retained while the account is active and for a reasonable period afterward to handle account-related issues and legal claims. Transaction and accounting records are retained for the period required by applicable law. Security logs are retained only as long as reasonably necessary to investigate incidents and protect the app. Browser-stored data can be removed by clearing the relevant browser storage. You can choose not to provide optional information and deny microphone or MIDI permissions; some features may then be unavailable.
          </p>
          <p className={paragraphClass}>
            If you are in the EEA, you may have the right to access your personal data, have inaccurate data corrected, request erasure or restriction of processing, object to processing based on legitimate interests, and receive data you provided in a portable format where the legal conditions are met. Where processing is based on consent, you may withdraw consent at any time. These rights are subject to legal conditions and exceptions. To exercise a right, contact the controller using the details below.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Security</h2>
          <p className={paragraphClass}>
            Reasonable steps are taken to protect information, but no internet service or storage method can be guaranteed completely secure. Avoid using shared devices for sign-in, and sign out when you have finished.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Children</h2>
          <p className={paragraphClass}>
            The app is not directed at children. If you believe a child has provided personal data, contact the controller so the matter can be reviewed and handled under applicable law.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Changes and contact</h2>
          <p className={paragraphClass}>
            This policy may be updated as the app changes. The latest version and its update date will appear on this page.
          </p>
          <p className={paragraphClass}>
            Data controller: Ritrix_Games
            <br />
            Privacy contact: <a className="text-cyan-300 underline hover:text-cyan-200" href="mailto:rt73734729@gmail.com">rt73734729@gmail.com</a>
          </p>
        </section>
      </article>
    </main>
  );
}