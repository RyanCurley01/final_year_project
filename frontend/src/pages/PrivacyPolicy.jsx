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
          <p className={paragraphClass}>Last updated: October 20, 2026</p>
          <p className={paragraphClass}>
            This policy explains how Music Recommendation Store (“the app”) handles information when you use the website and its features. The app is operated by [Project owner name].
          </p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Information the app handles</h2>
          <ul className={listClass}>
            <li>
              <strong className="text-white">Account information:</strong> name, email address, optional phone number, and account identifiers. Sign-in is provided through Firebase Authentication, including Google sign-in and email/password sign-in.
            </li>
            <li>
              <strong className="text-white">Orders and payments:</strong> items purchased, order details, amounts, payment status, timestamps, and PayPal order identifiers. PayPal processes payment details; the app does not intentionally store your full card number or PayPal password.
            </li>
            <li>
              <strong className="text-white">Music activity:</strong> when a signed-in user starts playback, the app may record the track, playback duration, completion information, device category, and a session identifier associated with the account. This supports app features such as play counts and recommendations.
            </li>
            <li>
              <strong className="text-white">Search and recommendation inputs:</strong> search terms and audio-feature values needed to return music results and recommendations may be sent to the app’s services and relevant third-party APIs.
            </li>
            <li>
              <strong className="text-white">Audio, MIDI, and images:</strong> microphone audio is analyzed in your browser; the app sends derived audio-feature values to its recommendation service, not the microphone recording. MIDI messages are processed in the browser to calculate recommendation targets, and those targets may be sent to the recommendation service. Images used in Spectrogram Creator are processed in the browser. Saved presets or images may remain in browser storage.
            </li>
            <li>
              <strong className="text-white">Technical information:</strong> hosting and infrastructure providers may process connection details, such as IP address, browser information, and service logs, to deliver and protect the app.
            </li>
          </ul>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">How information is used</h2>
          <p className={paragraphClass}>
            Information is used to create and maintain accounts, provide music and recommendation features, process orders, record purchase history, respond to support or privacy requests, and maintain the security and operation of the app. Playback activity may also be used to calculate popular tracks and improve music discovery features.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Browser storage</h2>
          <p className={paragraphClass}>
            The app uses browser local storage and session storage for sign-in state, cart and app state, preferences such as MIDI mappings, saved Spectrogram Creator content, and session identifiers. During an active email/password session, the app keeps the entered password in memory to authenticate requests to legacy backend services; it does not write raw passwords to app-managed browser storage. Older saved sessions are cleaned when the app loads. Firebase, PayPal, and hosting providers may also use cookies or similar technologies as described in their own policies.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Service providers and sharing</h2>
          <p className={paragraphClass}>
            The app uses third-party services to operate. Depending on the feature you use, information may be processed by Google Firebase for authentication, PayPal for checkout, Vercel for frontend hosting, Railway for backend and database hosting, AWS for file storage, Apple’s iTunes services for music search and previews, and LoremFlickr for image search. These providers handle information under their own privacy terms. The app does not sell personal information for advertising.
          </p>
          <p className={paragraphClass}>
            Information may also be disclosed when necessary to protect the app or its users, respond to a lawful request, or meet a legal obligation. Service providers may process information in countries other than your own.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Retention and your choices</h2>
          <p className={paragraphClass}>
            Information is kept for as long as needed to operate the app, maintain account and order records, resolve issues, and meet legal or security needs. There is no published fixed retention schedule. You can choose not to provide optional information, deny microphone or MIDI permissions, and clear app data stored in your browser; some features may then be unavailable.
          </p>
          <p className={paragraphClass}>
            Depending on where you live, you may have rights to request access to, correction of, or deletion of your personal information. Contact the project operator below to make a request. Some order or security records may need to be retained where required by law or for legitimate operational reasons.
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
            The app is not designed for children. If you believe a child has provided personal information, contact the project operator so the request can be reviewed and handled under applicable law.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Changes and contact</h2>
          <p className={paragraphClass}>
            This policy may be updated as the app changes. The latest version and its update date will appear on this page.
          </p>
          <p className={paragraphClass}>
            Project operator: [Project owner name]
            <br />
            Privacy contact: [Add a privacy contact email]
          </p>
        </section>
      </article>
    </main>
  );
}