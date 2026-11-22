from django.urls import path

from .views import InvitationAcceptView, InvitationPreviewView

urlpatterns = [
    path("invitations/preview/", InvitationPreviewView.as_view()),
    path("invitations/accept/", InvitationAcceptView.as_view()),
]
