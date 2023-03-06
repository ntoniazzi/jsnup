<script lang="ts" setup>
const props = defineProps({
    modelValue: { type: Number, require: true },
    min: { type: Number, require: false },
    max: { type: Number, require: false },
});

const emit = defineEmits(['update:model-value']);

function inc() {
    emit('update:model-value', Math.min(props.max, props.modelValue + 1));
}

function dec() {
    emit('update:model-value', Math.max(props.min, props.modelValue - 1));
}

</script>

<template>
    <div class="spin-button">
        <button
            :disabled="props.modelValue === props.min"
            @click="dec"
        >⮟</button>
        <span>{{ props.modelValue }}</span>
        <button
            :disabled="props.modelValue >= props.max"
            @click="inc"
        >⮝</button>
    </div>
</template>

