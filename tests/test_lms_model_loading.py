import unittest
from unittest.mock import call, patch

from evaluation_core import load_lms_model


class LMStudioModelLoadingTests(unittest.TestCase):
    @patch("evaluation_core.lms_api_request")
    def test_explicit_settings_force_reload_and_are_sent_to_lm_studio(self, request):
        request.side_effect = [
            {
                "data": [
                    {
                        "id": "deepseek-v4",
                        "state": "loaded",
                        "instance_id": "deepseek-v4-instance",
                    }
                ]
            },
            {},
            {
                "status": "loaded",
                "load_config": {
                    "context_length": 16384,
                    "eval_batch_size": 128,
                    "flash_attention": True,
                    "offload_kv_cache_to_gpu": False,
                },
            },
        ]

        loaded = load_lms_model(
            "deepseek-v4",
            context_length=16384,
            eval_batch_size=128,
            flash_attention=True,
            cpu_kv_cache=True,
        )

        self.assertTrue(loaded)
        self.assertEqual(
            request.call_args_list,
            [
                call("/api/v0/models"),
                call(
                    "/api/v1/models/unload",
                    method="POST",
                    data={"model": "deepseek-v4-instance"},
                ),
                call(
                    "/api/v1/models/load",
                    method="POST",
                    data={
                        "model": "deepseek-v4",
                        "context_length": 16384,
                        "eval_batch_size": 128,
                        "flash_attention": True,
                        "offload_kv_cache_to_gpu": False,
                        "echo_load_config": True,
                    },
                    timeout=120,
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
