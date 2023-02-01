<script lang="js">
app.component('widgets', {
	data() { return {
		foo: 'Foo!',
		bar: 'Bar!',
		baz: 'Baz!',
	}},
});
</script>

<template>
	<p>Hello <b>{{foo}}</b></p>
</template>
