from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings


class AdminHttpsProxyTests(TestCase):
    @override_settings(
        ALLOWED_HOSTS=["job-radar.fly.dev"],
        STORAGES={
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {
                "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
            },
        },
    )
    def test_admin_login_accepts_https_origin_behind_fly_proxy(self):
        user_model = get_user_model()
        user_model.objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="password-12345",
        )
        client = Client(enforce_csrf_checks=True)

        response = client.get(
            "/admin/login/",
            HTTP_HOST="job-radar.fly.dev",
            HTTP_X_FORWARDED_PROTO="https",
        )
        csrf_token = response.context["csrf_token"]

        response = client.post(
            "/admin/login/?next=/admin/",
            {
                "username": "admin",
                "password": "password-12345",
                "csrfmiddlewaretoken": csrf_token,
                "next": "/admin/",
            },
            HTTP_HOST="job-radar.fly.dev",
            HTTP_ORIGIN="https://job-radar.fly.dev",
            HTTP_X_FORWARDED_PROTO="https",
        )

        self.assertNotEqual(response.status_code, 403)
