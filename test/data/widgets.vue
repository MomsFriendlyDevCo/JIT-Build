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
	<div class="widgets">
		<p class="greeting">
			Hello <b>{{foo}}</b>
		</p>
	</div>
</template>

<style lang="scss">
.widgets {
	& .greeting {
		font-decoration: underline;
	}
}
</style>
