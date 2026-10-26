import unittest
from unittest.mock import patch

import numpy as np

import ml_service
from routes.recommendations import (
    _blended_similarity_score,
    _feature_vector_similarity,
    _is_discover_candidate,
)


class RecommendationScoringTests(unittest.TestCase):
    def test_identical_feature_vectors_have_perfect_similarity(self):
        vector = np.zeros(51).tolist()

        with patch.object(ml_service, "feature_scaler", None):
            self.assertEqual(_feature_vector_similarity(vector, vector), 1.0)

    def test_larger_normalized_feature_distance_scores_lower(self):
        target = np.zeros(51).tolist()
        near_match = target.copy()
        distant_match = target.copy()
        near_match[0] = 20.0
        distant_match[0] = 100.0

        with patch.object(ml_service, "feature_scaler", None):
            near_score = _feature_vector_similarity(target, near_match)
            distant_score = _feature_vector_similarity(target, distant_match)

        self.assertGreater(near_score, distant_score)

    def test_blended_score_rewards_feature_and_core_similarity(self):
        close_score = _blended_similarity_score(0.9, 0.9, 0.5)
        distant_score = _blended_similarity_score(0.4, 0.4, 0.5)

        self.assertGreater(close_score, distant_score)
        self.assertLessEqual(close_score, 1.0)

    def test_discover_candidates_stay_in_target_id_namespace(self):
        self.assertTrue(_is_discover_candidate(12, 5))
        self.assertFalse(_is_discover_candidate(-12, 5))
        self.assertTrue(_is_discover_candidate(-12, -5))
        self.assertFalse(_is_discover_candidate(12, -5))


if __name__ == "__main__":
    unittest.main()
