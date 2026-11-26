from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import TenantViewMixin

from . import services
from .filters import TaskFilter
from .models import Task
from .serializers import TaskSerializer, TaskStatusSerializer


class TaskViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Task
    permission_map = {
        "list": "tasks.view", "retrieve": "tasks.view", "create": "tasks.create", "update": "tasks.update",
        "partial_update": "tasks.update", "destroy": "tasks.update", "change_status": "tasks.update",
        "complete": "tasks.complete",
    }
    serializer_class = TaskSerializer
    filterset_class = TaskFilter
    search_fields = ["title", "description", "complaint__number", "eight_d_report__number"]
    ordering_fields = ["due_date", "created_at", "priority", "status"]

    def get_queryset(self):
        return super().get_queryset().select_related("assignee__user", "complaint", "eight_d_report")

    def _actor(self):
        return {"user": self.request.user, "membership": self.request.membership}

    def perform_create(self, serializer):
        serializer.instance = services.create_task(
            company=self.request.company, data=serializer.validated_data, **self._actor()
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_task(serializer.instance, serializer.validated_data, **self._actor())

    def perform_destroy(self, instance):
        services.delete_task(instance, user=self.request.user)

    @extend_schema(request=TaskStatusSerializer, responses=TaskSerializer)
    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None, **kwargs):
        """Move to another status. Done needs tasks.complete; reopening a finished task needs tasks.update."""
        task = self.get_object()
        s = TaskStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.change_status(task, s.validated_data["status"], notes=s.validated_data.get("completion_notes"),
                               **self._actor())
        return Response(self.get_serializer(task).data)

    @extend_schema(request=None, responses=TaskSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None, **kwargs):
        """Shortcut for status=done, with optional `completion_notes`."""
        task = self.get_object()
        services.change_status(task, Task.Status.DONE, notes=request.data.get("completion_notes"), **self._actor())
        return Response(self.get_serializer(task).data)
