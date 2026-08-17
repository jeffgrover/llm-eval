import unittest
from unittest.mock import call, patch

from evaluation_core import get_lms_loaded_context_length, load_lms_model


class LMStudioLoadedContextTests(unittest.TestCase):
    @patch("evaluation_core.lms_api_request")
    def test_loaded_context_length_read_from_loaded_instance(self, request):
        request.return_value = {
            "models": [
                {
                    "id": "other-model",
                    "state": "loaded",
                    "loaded_instances": [
                        {"id": "other-model", "config": {"context_length": 8192}}
                    ],
                },
                {
                    "id": "qwen3.8-27b",
                    "state": "loaded",
                    "loaded_instances": [
                        {"id": "qwen3.8-27b", "config": {"context_length": 102400}}
                    ],
                },
            ]
        }
        self.assertEqual(get_lms_loaded_context_length("qwen3.8-27b"), 102400)

    @patch("evaluation_core.lms_api_request")
    def test_loaded_context_length_ignores_unloaded_models(self, request):
        request.return_value = {
            "models": [
                {
                    "id": "qwen3.8-27b",
                    "state": "unloaded",
                    "loaded_instances": [
                        {"id": "qwen3.8-27b", "config": {"context_length": 102400}}
                    ],
                }
            ]
        }
        self.assertIsNone(get_lms_loaded_context_length("qwen3.8-27b"))

    @patch("evaluation_core.lms_api_request")
    def test_loaded_context_length_none_when_api_unreachable(self, request):
        request.return_value = None
        self.assertIsNone(get_lms_loaded_context_length("qwen3.8-27b"))


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
                    data={"instance_id": "deepseek-v4-instance"},
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
