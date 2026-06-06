import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MatchingLayout from './matching/MatchingLayout';
import ExploreView from './matching/components/ExploreView';
import BasketView from './matching/components/BasketView';
import HarvestView from './matching/components/HarvestView';
import ProfileMatchView from './matching/components/ProfileMatchView';

const Matching = () => (
  <Routes>
    <Route element={<MatchingLayout />}>
      <Route index element={<Navigate to="explore" replace />} />
      <Route path="explore" element={<ExploreView />} />
      <Route path="basket" element={<BasketView />} />
      <Route path="harvest" element={<HarvestView />} />
      <Route path="profile" element={<ProfileMatchView />} />
      <Route path="*" element={<Navigate to="explore" replace />} />
    </Route>
  </Routes>
);

export default Matching;
