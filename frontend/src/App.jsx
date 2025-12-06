import { useSelector } from 'react-redux';
import { Route, Routes } from 'react-router-dom';

import { Searchbar, Sidebar, MusicPlayer, TopPlay } from './components';
import { ArtistDetails, TopArtists, AroundYou, CustomerScreen, Search, SongDetails, TopCharts } from './pages';
import PersonalRecommendations from './components/PersonalRecommendations';

const App = () => {
  const { activeSong } = useSelector((state) => state.player);

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col bg-gradient-to-br from-[#041529] to-[#2970c2]">
        <div className="px-6 h-full overflow-y-scroll flex xl:flex-row flex-col-reverse">
          <div className="flex-1 h-fit pb-40">
            <Searchbar />

            <Routes>
              <Route path="/" element={<CustomerScreen />} />
              <Route path="/top-artists" element={<TopArtists />} />
              <Route path="/top-charts" element={<TopCharts />} />
              <Route path="/around-you" element={<AroundYou />} />
              <Route path="/artists/:id" element={<ArtistDetails />} />
              <Route path="/songs/:songid" element={<SongDetails />} />
              <Route path="/search/:searchTerm" element={<Search />} />
            </Routes>
          </div>
          <div className="relative top-0 h-fit py-10">
            <TopPlay />
              <div className="w-full px-6 py-64">
                <PersonalRecommendations />
              </div>
          </div>
        </div>
      </div>

      {(activeSong?.albumTitle || activeSong?.gameTitle) && (
        <div className="absolute h-28 bottom-0 left-0 right-0 flex animate-slideup bg-gradient-to-br from-white/10 to-[#cf616a] backdrop-blur-lg rounded-t-3xl z-10">
          <MusicPlayer />
        </div>
      )}
    </div>
  );
};

export default App;
