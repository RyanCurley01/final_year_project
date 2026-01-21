import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';

const ARTIST_INFO = {
  'aphex twin': {
    name: 'Aphex Twin',
    realName: 'Richard D. James',
    images: [
      '/artist-pictures/richard-d-james-aka-aphex-twin.jpg',
    ],
    pioneer: `Aphex Twin, the alias of Richard D. James, is widely regarded as one of the most influential and innovative figures in electronic music. Emerging from Cornwall, England in the early 1990s, he pioneered the intelligent dance music (IDM) genre with his groundbreaking album "Selected Ambient Works 85-92" (1992).

His revolutionary approach to sound design, intricate programming, and willingness to push the boundaries of electronic music has influenced countless artists across multiple genres. He's known for his complex drum programming, often using breakbeats at extreme tempos, and his ability to blend beautiful ambient textures with harsh, abrasive sounds.

James helped establish Rephlex Records, providing a platform for experimental electronic music. His work spans from serene ambient compositions to aggressive acid techno, demonstrating unparalleled versatility. Albums like "Richard D. James Album" (1996) and "Drukqs" (2001) showcase his technical mastery and unconventional approach to rhythm and melody.

His influence extends beyond music production to music technology itself, having created custom software and modified equipment to achieve his unique sound. Aphex Twin's willingness to experiment and reject commercial conventions has made him a legendary figure in electronic music, inspiring generations of producers to push creative boundaries.`
  },
  'boards of canada': {
    name: 'Boards of Canada',
    realName: 'Michael Sandison & Marcus Eoin',
    images: [
      '/artist-pictures/OIP.webp'
    ],
    pioneer: `Boards of Canada, the Scottish electronic duo consisting of brothers Michael Sandison and Marcus Eoin, revolutionized electronic music with their distinctive nostalgic and dreamlike sound. Emerging in the mid-1990s, they pioneered a unique subgenre often described as "hauntology" - music that evokes memories and nostalgia for a past that may never have existed.

Their seminal album "Music Has the Right to Children" (1998) redefined what ambient and downtempo electronic music could be. By incorporating analog warmth, degraded audio samples, and subtle mathematical patterns, they created an instantly recognizable aesthetic that countless artists have attempted to emulate.

The duo's meticulous production techniques involve using vintage synthesizers, tape manipulation, and carefully selected samples from 1970s educational films and documentaries. This creates a haunting, nostalgic atmosphere that transports listeners to hazy childhood memories and imagined pasts.

Their influence on modern electronic music is immeasurable, spawning entire subgenres and inspiring artists across hip-hop, ambient, and experimental music. Albums like "Geogaddi" (2002) and "The Campfire Headphase" (2005) showcase their ability to blend organic and electronic elements seamlessly.

Boards of Canada's mysterious persona, rare releases, and cryptic marketing have only added to their legendary status, making them one of the most revered and influential acts in electronic music history.`
  },
  'squarepusher': {
    name: 'Squarepusher',
    realName: 'Tom Jenkinson',
    images: [
      '/artist-pictures/Squarepusher-9-14-16-1268x742.jpg'
    ],
    pioneer: `Squarepusher, the moniker of Tom Jenkinson, is a pioneering force in electronic music, renowned for his virtuosic bass playing and complex drum programming. Emerging from Chelmsford, England in the mid-1990s, he became a key figure in the intelligent dance music (IDM) and drill 'n' bass movements.

His groundbreaking work combines jazz fusion, drum and bass, acid house, and classical composition in ways previously unimaginable. Albums like "Hard Normal Daddy" (1997) and "Go Plastic" (2001) showcase his ability to program impossibly intricate breakbeats while maintaining musicality and emotional depth.

As both an electronic producer and accomplished bassist, Squarepusher bridges the gap between organic instrumentation and digital manipulation. His technical proficiency on the bass guitar, often compared to jazz legends, brings a human element to highly programmed electronic music.

He pioneered the use of complex time signatures and polyrhythms in electronic dance music, challenging listeners and pushing the genre's boundaries. His work on the Warp Records label helped define the sound of experimental electronic music in the late 1990s and early 2000s.

Beyond production, Squarepusher has been at the forefront of live electronic performance, creating custom visual software and performing with self-built robotic instruments. His influence extends across electronic music, jazz fusion, and experimental genres, inspiring producers to embrace technical complexity without sacrificing artistic vision.

His prolific output and constant evolution have cemented his status as one of electronic music's most important innovators and virtuosos.`
  }
};

const ArtistDetails = () => {
  const { artistName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState(null);

  useEffect(() => {
    if (!artistName) {
      setLoading(false);
      return;
    }
    
    const normalizedName = artistName.toLowerCase().replace(/-/g, ' ');
    const artistData = ARTIST_INFO[normalizedName];
    
    if (artistData) {
      setArtist(artistData);
    }
    setLoading(false);
  }, [artistName]);

  if (loading) return <Loader title="Loading artist information..." />;

  if (!artist) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-400 text-lg mb-4">Artist not found</p>
        <button 
          onClick={() => navigate(-1)} 
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-4 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
        >
          ← Back
        </button>
        
        {/* Artist Header - centered and stacked */}
        <div className="flex flex-col items-center text-center gap-6 w-full">
          <h1 className="font-bold text-3xl md:text-4xl text-white">{artist.name}</h1>
          <p className="text-gray-400 text-lg">{artist.realName}</p>
        </div>
      </div>

      {/* Images Gallery - centered */}
      <div className="mb-8">
        <div className="flex flex-col items-center gap-6 w-full">
          {artist.images.map((image, index) => (
            <div 
              key={index}
              className="relative w-full max-w-md aspect-square rounded-lg overflow-hidden bg-gray-800 shadow-xl hover:scale-105 transition-transform duration-300"
            >
              <img 
                src={image}
                alt={`${artist.name} ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#374151"/><text x="50%" y="50%" text-anchor="middle" fill="#9CA3AF" font-size="20">Image not available</text></svg>');
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Biography */}
      <div className="mb-8">
        <h2 className="font-bold text-2xl text-white mb-4 text-center">Pioneer of Electronic Music</h2>
        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10 max-w-2xl mx-auto">
          {artist.pioneer.split('\n\n').map((paragraph, index) => (
            <p key={index} className="text-gray-300 leading-relaxed mb-4 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Back button at bottom */}
      <div className="flex justify-center mt-6 mb-24 pb-8">
        <button 
          onClick={() => navigate(-1)} 
          className="px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-all font-semibold"
        >
          ← Back to Music
        </button>
      </div>
    </div>
  );
};

export default ArtistDetails;
