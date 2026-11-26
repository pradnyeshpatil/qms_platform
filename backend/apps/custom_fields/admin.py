from django.contrib import admin

from .models import CustomFieldDefinition, CustomFieldDefinitionVersion

admin.site.register(CustomFieldDefinition)
admin.site.register(CustomFieldDefinitionVersion)
